# Prompt système modulaire — règles partagées + style overridable par provider

Contexte : le bot GPT (`gpt-5.6-terra`) produit du formatage cassé sur WhatsApp (`### Grillades` en Markdown non supporté, gras systématique sur les prix, ton "reçu de caisse"). Le `buildSystemPrompt` actuel de `restaurant-ordering.module-definition.ts` est provider-agnostique et calibré pour Claude — GPT interprète les mêmes consignes de style différemment.

Objectif : séparer dans le prompt système les **règles métier** (identité, règles non négociables, flow de commande) — qui restent une source unique partagée par tous les providers — des **directives de style/formatage**, qui deviennent overridables par provider. Pas de duplication de la logique métier.

## Contraintes à respecter

- Les règles métier non négociables (ne jamais inventer un prix/une option, revalidation stricte avant `confirm_order`, flow de commande) restent dans **un seul bloc**, jamais dupliqué, jamais overridable par provider. C'est la partie la plus sensible du prompt (elle protège l'argent des clients) — elle ne doit pas pouvoir diverger silencieusement entre Claude et GPT.
- Seul le bloc de style/formatage devient overridable.
- Le comportement actuel avec `AI_PROVIDER=claude` doit être strictement identique après ce refactor (le style par défaut = le style Claude actuel, mot pour mot).
- Ne pas toucher à `getTools()`, aux tools eux-mêmes, ni à la logique de session/panier.
- Le flow Vision menu (extraction image, Claude-only) n'est pas concerné — il n'utilise pas `buildSystemPrompt`.

## Phase 1 — Découper le prompt existant en blocs nommés

Dans `restaurant-ordering.module-definition.ts` :

- Identifier dans le texte actuel de `buildSystemPrompt` les segments correspondant à : (a) identité/présentation du restaurant, (b) règles métier non négociables + flow de commande, (c) consignes de ton et de formatage (la section "pas de markdown/gras/emoji systématique/pas d'ouverture creuse" calibrée le 18 août).
- Extraire (a) et (b) dans une fonction/constante qui reste strictement identique au texte actuel — aucune reformulation, juste un découpage mécanique. Zéro changement de comportement à cette étape.
- Extraire (c) dans une constante `DEFAULT_STYLE_DIRECTIVES` — c'est le texte de style actuel, calibré Claude, servira de valeur par défaut.

## Phase 2 — Type AiProvider partagé

- Si un type `AiProvider` (`'claude' | 'openai'`) n'existe pas déjà quelque part de partagé (vérifier dans `src/ai/`), le créer dans `src/ai/ai.service.interface.ts` ou `ai.constants.ts` — un seul endroit, réutilisé partout (config, module-definition, factory).

## Phase 3 — Mécanisme d'override de style

Dans `restaurant-ordering.module-definition.ts` :

```typescript
const STYLE_OVERRIDES: Partial<Record<AiProvider, string>> = {
  openai: `...`, // à écrire en Phase 4
};

function resolveStyleDirectives(provider: AiProvider): string {
  return STYLE_OVERRIDES[provider] ?? DEFAULT_STYLE_DIRECTIVES;
}
```

- Modifier la signature de `buildSystemPrompt` pour accepter un second paramètre optionnel `provider: AiProvider = 'claude'` (défaut = comportement actuel inchangé si l'appelant ne précise rien).
- Composer le prompt final : bloc identité + bloc règles métier (inchangés) + `resolveStyleDirectives(provider)` + bloc flow.
- Vérifier que `ModuleDefinition` (l'interface générique dans `module-registry/`) accepte bien ce paramètre optionnel sans casser les autres implémentations futures de modules (aucune autre pour l'instant, mais garder l'interface propre).

## Phase 4 — Écrire le style override GPT

Dans `STYLE_OVERRIDES.openai`, écrire une version plus explicite et insistante que `DEFAULT_STYLE_DIRECTIVES`, en gardant le même esprit ("serveur WhatsApp sympa", pas un bot marketing), mais avec des interdictions plus fermes et répétées, ciblant précisément les erreurs observées :

- Interdiction explicite de tout caractère `#` en début de ligne, sous quelque forme que ce soit (pas de titres Markdown).
- Interdiction des listes à puces (`•`, `-`, `*` en début de ligne) sauf si le client demande explicitement une liste.
- Gras (`*mot*`) limité à 1-2 mots maximum par message, jamais appliqué systématiquement à chaque prix ou nom de quartier.
- Rappel que c'est un message WhatsApp entre humains, pas un reçu ou un document structuré.

Ne pas copier-coller mot pour mot les règles Claude en espérant que ça suffise — le problème observé montre que GPT a besoin d'un phrasing plus direct/répétitif sur ces points précis. Formuler ces interdictions de façon plus catégorique que la version Claude.

## Phase 5 — Brancher le provider dans l'orchestrateur

- `ConversationOrchestratorService` doit connaître le provider actif (déjà lu quelque part pour la factory `AI_PROVIDER` dans `ai.module.ts`) et le transmettre à `moduleDefinition.buildSystemPrompt(business, provider)`.
- Injecter `ConfigService` si pas déjà fait, lire `config.get('ai.provider')`, passer la valeur (typée `AiProvider`, avec le même fallback `claude` que la factory si valeur inconnue).

## Filet de sécurité additionnel (à faire dans la même passe)

En complément du prompt (qui réduit le problème mais ne le garantit pas à 100%), ajouter une sanitization légère du texte de sortie avant l'envoi WhatsApp, **provider-agnostique**, dans le point unique où la réponse texte sort de `AiService` avant d'être passée à `WhatsappClientService.sendTextMessage` :

- Supprimer toute séquence `#`, `##`, `###` (et plus) en début de ligne.
- Ne pas toucher au reste du texte (ne pas sur-nettoyer, juste ce cas précis).
- Un seul endroit dans le code (pas dupliqué par provider) — probablement dans l'orchestrateur juste avant l'envoi, ou dans un petit util `sanitizeWhatsappText()`.

## Non fait (volontairement)

- Aucun changement aux règles métier partagées (bloc business rules).
- Aucune duplication complète du prompt : seul le bloc style est overridable.
- Pas de style override pour Claude (il garde `DEFAULT_STYLE_DIRECTIVES`, déjà calibré).
- Pas de mécanisme d'override pour d'autres futurs providers (Mistral, Gemini) — le pattern `STYLE_OVERRIDES` est prêt à en accueillir, mais ne pas en écrire avant qu'ils existent réellement.
- Pas de tests A/B automatisés du style — validation manuelle uniquement dans cette passe.

## Tests à mettre à jour

- `restaurant-ordering.module-definition.spec.ts` : ajouter des cas pour `buildSystemPrompt(business, 'openai')` (vérifie que le style override GPT est bien injecté) et `buildSystemPrompt(business, 'claude')` / sans provider (vérifie que le comportement par défaut est strictement identique à avant ce refactor — comparaison texte exact si possible).
- `conversation-orchestrator.service.spec.ts` : vérifier que le provider actif est bien lu et transmis à `buildSystemPrompt`.
- Nouveau test pour la fonction de sanitization : un texte contenant `### Titre` en entrée doit ressortir sans le `###`.

## Validation attendue en fin de tâche

- `AI_PROVIDER=claude` → prompt système et comportement du bot strictement identiques à avant (non-régression).
- `AI_PROVIDER=openai` → conversation de test WhatsApp (manuelle, ngrok) : plus de `###`, gras limité, ton plus proche de la conversation naturelle attendue. Comparer visuellement avec les captures d'écran des conversations CMD-0014 (le cas problématique) et une conversation Claude équivalente.
- `npm run build` sans erreur, tests verts.