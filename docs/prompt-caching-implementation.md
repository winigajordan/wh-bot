# Plan d’implémentation — Prompt caching Anthropic

Document de conception **avant code**. Décrit exactement ce qui serait modifié, pourquoi, et comment valider.

Dernière rédaction : 27 août 2026.

---

## 1. État actuel

Aujourd’hui, `ClaudeService.createMessage()` envoie :

```typescript
this.client.messages.create({
  model: this.model,
  max_tokens: maxTokens,
  system: systemPrompt,        // string simple
  messages,
  tools,                         // sans cache_control
});
```

**Conséquence :** à chaque appel (y compris chaque itération de la boucle tools), Anthropic re-tokenise entièrement le system prompt (~3–5 k tokens) + les 10 définitions de tools (~2–3 k tokens) + l’historique messages.

**Appels concernés :**
| Méthode | Tools | Candidat cache ? |
|---------|-------|------------------|
| `generateReplyWithToolLoop` | oui (10 tools resto) | **Oui — priorité 1** |
| `generateFallbackReplyWithoutTools` | non | Partiel (system seulement) |
| `generateReplyOnce` | optionnel | Partiel |
| `extractMenuFromImages` (Vision) | non | **Non** (one-shot, images différentes) |

---

## 2. Objectif

Activer le **prompt caching** Anthropic (`cache_control: { type: 'ephemeral' }`) sur la partie **stable** des requêtes bot WhatsApp, pour :

- réduire la **latence** (surtout tours 2+ de la boucle tools) ;
- réduire le **coût** input sur les tokens lus depuis le cache ;
- ne **rien changer** au comportement métier (même prompt, mêmes tools, mêmes réponses).

---

## 3. Principe Anthropic (rappel)

Le cache fonctionne par **breakpoints** : tout le préfixe *avant* le breakpoint identique entre deux requêtes peut être servi depuis le cache (TTL ~5 min, renouvelé à chaque hit).

On peut placer des breakpoints sur :
- blocs `system` (tableau de `{ type: 'text', text, cache_control? }`) ;
- le **dernier** tool de la liste `tools` ;
- le **dernier** bloc d’un message (contenu user/assistant).

**Règle pratique pour nous :**
1. Mettre un breakpoint sur le **system prompt complet** (stable par business + module).
2. Mettre un breakpoint sur le **dernier tool** (liste identique pour `restaurant_ordering`).
3. **Ne pas** mettre de breakpoint sur l’historique messages au MVP — il change à chaque tour client et invaliderait souvent le cache.

---

## 4. Ce qui est stable vs variable

### Stable (bon pour le cache)

| Élément | Variabilité |
|---------|-------------|
| Prompt module `restaurant_ordering` (règles menu, commande, ton, vouvoiement…) | Identique pour tous les restos du module |
| Ligne `business.name`, `address`, `contactPhone` | Stable **par business** (change rarement) |
| Ligne budget tools (`maxIterations`) | Stable tant que `CLAUDE_TOOL_MAX_ITERATIONS` ne change pas |
| Définitions `ORDERING_TOOLS` (10 tools) | Identiques pour tous les restos `restaurant_ordering` |

### Variable (ne pas cacher au MVP)

| Élément | Pourquoi |
|---------|----------|
| Historique `messages` (user/assistant) | Différent à chaque message client |
| Contenu tool_results dans la boucle | Différent à chaque itération |
| Extraction Vision menu | Images uniques, pas de répétition |

**Conséquence :** le gain principal vient du cache **system + tools**, rejoués à chaque message WhatsApp et à chaque itération tool *dans le même appel API*.

---

## 5. Fichiers à modifier

### 5.1 `src/config/configuration.ts`

Ajouter :

```typescript
anthropic: {
  // ... existant
  promptCacheEnabled: process.env.ANTHROPIC_PROMPT_CACHE_ENABLED !== 'false',
  // false explicite pour désactiver ; true par défaut une fois validé
},
```

### 5.2 `.env.example`

```env
# Prompt caching Anthropic (system + tools). Mettre false pour désactiver.
ANTHROPIC_PROMPT_CACHE_ENABLED=true
```

### 5.3 `src/claude/claude.service.ts` — cœur de l’implémentation

#### A. Helper pour construire le `system` cacheable

```typescript
private buildCachedSystem(systemPrompt: string): Anthropic.Messages.MessageCreateParams['system'] {
  if (!this.isPromptCacheEnabled()) {
    return systemPrompt;
  }
  return [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
  ];
}
```

#### B. Helper pour annoter le dernier tool

```typescript
private buildCachedTools(tools?: Anthropic.Tool[]): Anthropic.Tool[] | undefined {
  if (!tools?.length || !this.isPromptCacheEnabled()) {
    return tools;
  }
  return tools.map((tool, index) =>
    index === tools.length - 1
      ? { ...tool, cache_control: { type: 'ephemeral' } }
      : tool,
  );
}
```

#### C. Modifier `createMessage`

```typescript
return this.client.messages.create({
  model: this.model,
  max_tokens: maxTokens,
  system: this.buildCachedSystem(systemPrompt),
  messages,
  ...(tools?.length ? { tools: this.buildCachedTools(tools) } : {}),
});
```

#### D. Logger l’usage cache (observabilité)

Après chaque `createMessage`, si `response.usage` :

```typescript
this.logger.debug(
  `Claude usage in=${usage.input_tokens} out=${usage.output_tokens} ` +
  `cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
  `cache_read=${usage.cache_read_input_tokens ?? 0}`,
);
```

Permet de vérifier en dev :
- **1er message** d’une conversation → `cache_write` > 0 ;
- **messages suivants** (< 5 min, même business) → `cache_read` > 0.

#### E. Ne pas toucher `extractMenuFromImages`

La Vision reste sans cache (prompt différent, images uniques, pas de ROI).

---

## 6. Ce qu’on ne fera **pas** au MVP

| Idée | Raison |
|------|--------|
| Cache sur l’historique messages | Trop volatile ; complexité pour peu de gain |
| Cache par `businessId` côté Redis | Anthropic gère déjà le cache par préfixe identique |
| Split system prompt stable / variable | Possible plus tard (partager le gros bloc règles entre restos) ; pas nécessaire pour v1 |
| Cache sur les tool_results | Contenu JSON différent à chaque appel |
| Tests e2e contre l’API réelle | Coût + flaky ; mock suffit |

---

## 7. Impact sur la boucle tools

Scénario typique : client commande → Claude appelle `get_menu` puis `add_to_cart` puis répond.

```
Itération 1 : createMessage(system + tools + messages)
              → cache_write sur system + tools
Itération 2 : createMessage(system + tools + messages + assistant tool_use + user tool_results)
              → cache_read sur system + tools (identiques)
Itération 3 : idem
```

**Gain :** sans cache, chaque itération repaye ~5–8 k tokens input stables. Avec cache, seuls les nouveaux blocs (tool_use, tool_results, historique) sont facturés en plein tarif.

---

## 8. Tests

### 8.1 `src/claude/claude.service.spec.ts`

Ajouter des cas :

1. **`promptCacheEnabled=true`** → `messages.create` reçoit `system` en tableau avec `cache_control`, et le dernier tool aussi.
2. **`promptCacheEnabled=false`** → comportement actuel inchangé (string system, tools sans cache).
3. **`extractMenuFromImages`** → jamais de `cache_control` même si cache activé.

Mock :

```typescript
expect(createMock).toHaveBeenCalledWith(
  expect.objectContaining({
    system: [{ type: 'text', text: expect.any(String), cache_control: { type: 'ephemeral' } }],
    tools: expect.arrayContaining([
      expect.objectContaining({ name: 'get_order_status', cache_control: { type: 'ephemeral' } }),
    ]),
  }),
);
```

### 8.2 Validation manuelle (après merge)

1. Activer `ANTHROPIC_PROMPT_CACHE_ENABLED=true`.
2. Envoyer 2 messages WhatsApp espacés de < 5 min au **même** resto.
3. Vérifier dans les logs Nest :
   - 1er tour : `cache_write` > 0 ;
   - 2e tour : `cache_read` > 0.

---

## 9. Feature flag et rollout

| Phase | Config | Action |
|-------|--------|--------|
| Dev | `true` | Implémenter + tests unitaires + 1 test manuel WhatsApp |
| Staging / pilote | `true` | Observer logs 1 semaine (ratio cache_read / input) |
| Prod | `true` par défaut | Rollback instantané via `ANTHROPIC_PROMPT_CACHE_ENABLED=false` |

Aucune migration DB. Aucun changement dashboard. Aucun changement prompt métier.

---

## 10. Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| SDK trop vieux pour `cache_control` | Vérifier types `@anthropic-ai/sdk` ^0.117 — déjà récent ; compiler après modif |
| Cache invalidé si on modifie le prompt sans le savoir | Logs `cache_write` vs `cache_read` ; doc : redémarrer / attendre 5 min après changement prompt |
| Coût cache_write au 1er hit | Normal ; rentable dès le 2e message ou 2e itération tool |
| Comportement différent du modèle | Le cache ne change pas le contenu, seulement la facturation/latence |

---

## 11. Ordre d’implémentation (étapes concrètes)

1. **Config** — `promptCacheEnabled` + `.env.example` (15 min)
2. **ClaudeService** — helpers + `createMessage` + logs usage (45 min)
3. **Tests** — 3 cas dans `claude.service.spec.ts` (30 min)
4. **Test manuel** — 2 messages WhatsApp + lecture logs (15 min)
5. **Doc** — une ligne dans `avancement.md` (5 min)

**Estimation totale : ~2 h**, diff ciblé (~80 lignes), sans toucher orchestrateur, webhook, queue, ni prompt resto.

---

## 12. Évolution possible (post-MVP)

Si plusieurs restos partagent le même module :

- Extraire le **gros bloc de règles** (menu, commande, ton) en constante `RESTAURANT_ORDERING_STATIC_PROMPT`.
- System prompt = `[bloc statique cacheable] + [bloc business variable non cacheable]`.
- Tous les restos `restaurant_ordering` partageraient le cache du bloc statique (~90 % du prompt).

Non prioritaire tant qu’il n’y a qu’un pilote.

---

## 13. Checklist avant merge

- [ ] `ANTHROPIC_PROMPT_CACHE_ENABLED=false` ne change rien au comportement actuel
- [ ] `true` ajoute `cache_control` system + dernier tool uniquement sur `generateReply*`
- [ ] Vision (`extractMenuFromImages`) exclue
- [ ] Logs `cache_read` / `cache_write` visibles en DEBUG
- [ ] Tests unitaires verts
- [ ] Test manuel WhatsApp : 2 messages → cache_read > 0 au 2e

---

## 14. Résumé en une phrase

**On ajoute `cache_control: ephemeral` sur le system prompt et le dernier tool dans `ClaudeService.createMessage`, derrière un flag `.env`, sans modifier le contenu des prompts ni le flux conversation.**
