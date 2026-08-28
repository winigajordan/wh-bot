# Implémentation GptService — OpenAI gpt-5.6-terra (Responses API)

Contexte : `GptService` existe déjà comme squelette (retourne `Model gpt en cours d'implementation`) et implémente déjà l'interface `AiService`. Cette passe remplace le squelette par une vraie implémentation OpenAI, branchée derrière `AI_PROVIDER=openai`, sans toucher à `ClaudeService` ni à l'orchestrateur (déjà agnostiques du provider).

Modèle cible : `gpt-5.6-terra`. Ne pas utiliser `sol` ou `luna` sans validation explicite demandée séparément.

## Contraintes à respecter

- Ne touche à aucune logique métier resto, aucun prompt, aucun tool définis dans `restaurant-ordering/`. Les tools sont déjà au format neutre `AiToolDefinition { name, description, input_schema }` — `GptService` doit les convertir en interne vers le format OpenAI, jamais l'inverse.
- Ne modifie ni `ClaudeService`, ni `ai.service.interface.ts`, ni l'orchestrateur. Si l'interface actuelle s'avère insuffisante pour exposer une info nécessaire côté GPT, documenter le blocage plutôt que d'élargir l'interface sans validation.
- `AI_PROVIDER=claude` doit rester inchangé après cette tâche — non-régression obligatoire.
- Reste sur `claude-sonnet-4-6`/`claude-sonnet-5` inchangés : cette tâche ne touche que la branche `openai` de la factory dans `ai.module.ts`.

## Phase 1 — Dépendance et config

- Installer le SDK officiel : `npm install openai`.
- `.env.example` / `.env` : ajouter `OPENAI_API_KEY=` et `OPENAI_MODEL=gpt-5.6-terra`.
- `src/config/configuration.ts` : ajouter un bloc `openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.6-terra' }`.
- `GptService` lève une erreur explicite (`OPENAI_API_KEY manquante`) si la clé est absente au premier appel — même pattern que `ClaudeService` avec `ANTHROPIC_API_KEY`.

## Phase 2 — Conversion des tools (format neutre → format OpenAI)

Le format OpenAI Responses API pour les tools est **plat** (différent du format Anthropic qui est déjà plat aussi mais avec `input_schema`, donc conversion simple) :

```typescript
// Format neutre (AiToolDefinition), déjà existant :
{ name, description, input_schema }

// Format attendu par Responses API :
{ type: "function", name, description, parameters: input_schema, strict: false }
```

- Écrire un mapper privé `toOpenAiTools(tools: AiToolDefinition[])` dans `GptService`.
- Ne pas activer `strict: true` dans cette première passe (le mode strict impose des contraintes de schéma JSON plus rigides que ce que produisent peut-être tes définitions actuelles côté `ordering.tools.ts` — à valider séparément si besoin d'optimisation plus tard).

## Phase 3 — Boucle tool calling (Responses API)

Différences clés avec l'implémentation Claude actuelle, à bien respecter :

- Premier appel : `client.responses.create({ model, instructions: systemPrompt, input: messages, tools })`.
- Si la réponse contient des items de type `function_call` (peut y en avoir plusieurs en parallèle) : pour chacun, appeler `executor.execute(item.name, JSON.parse(item.arguments))`, puis construire un item `{ type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) }`.
- Renvoyer un nouvel appel avec `previous_response_id` (pas besoin de renvoyer tout l'historique) et `input` contenant uniquement les nouveaux `function_call_output`.
- Répéter jusqu'à ce que la réponse ne contienne plus de `function_call` — alors extraire le texte final (items de type `message`/`output_text`).
- Plafonner à un nombre max d'itérations, même valeur/config que `CLAUDE_TOOL_MAX_ITERATIONS` (réutiliser cette variable d'env plutôt que d'en créer une nouvelle spécifique GPT, pour rester cohérent) — si la limite est atteinte, comportement identique à Claude : dernier appel sans tools pour forcer une réponse texte.

## Phase 4 — Messages neutres → format OpenAI

- Les `AiMessage[]` neutres (`{role: 'user'|'assistant', content: string}`) se mappent directement dans `input` de la Responses API (déjà un format proche). Pas de conversion complexe nécessaire ici, contrairement aux tools.
- Le `systemPrompt` neutre devient le paramètre `instructions` de la Responses API (pas un message dans `input`).

## Phase 5 — Logging usage

- Reproduire le même niveau de log que `ClaudeService` : `Logger.debug` avec les tokens consommés à chaque appel.
- La Responses API retourne `response.usage.input_tokens`, `response.usage.output_tokens`, et `response.usage.input_tokens_details.cached_tokens` pour le cache (automatique côté OpenAI, pas de `cache_write` explicite comme Claude — juste `cached_tokens` en lecture).
- Format de log proposé, pour rester comparable visuellement aux logs Claude existants : `GPT usage in=X out=Y cached=Z` (pas de `cache_write` séparé puisque OpenAI ne facture pas l'écriture différemment).

## Non fait (volontairement, à ne pas implémenter dans cette passe)

- `strict: true` sur les tools (à activer dans une passe d'optimisation séparée si besoin).
- Streaming des réponses (le bot actuel n'en a pas besoin, WhatsApp Send API n'est pas streamé).
- Extraction menu Vision côté GPT (reste Claude-only, hors scope).
- Tests comparatifs automatisés Claude vs GPT (ça reste manuel via `test-manuel-bot.md` pour l'instant).
- Gestion d'un fallback automatique Claude→GPT en cas d'erreur runtime (le choix de provider reste statique via `.env`).
- Tuning de prompt spécifique à GPT (le system prompt resto reste celui écrit pour Claude ; s'il faut l'adapter, le faire dans une passe séparée après avoir observé le comportement réel).

## Tests à écrire

- `gpt.service.spec.ts` : mock du SDK OpenAI (comme `claude.service.spec.ts` mock le SDK Anthropic), vérifier :
  - Appel simple sans tools → texte retourné correctement.
  - Boucle avec un `function_call` → executor appelé avec les bons arguments, puis second appel avec `function_call_output` et `previous_response_id`.
  - Plusieurs `function_call` en parallèle dans une même réponse → tous exécutés avant le prochain appel.
  - Limite d'itérations atteinte → dernier appel sans tools.
  - Clé API absente → erreur explicite.

## Validation attendue en fin de tâche

- `npm run build` sans erreur.
- Tests existants (Claude + orchestrateur) toujours verts, aucune régression.
- `AI_PROVIDER=openai` + clé API valide → une conversation WhatsApp de test (manuelle, via ngrok) doit dérouler un flow complet menu → panier → livraison → confirmation, avec les mêmes garde-fous que Claude (jamais inventer un prix/une option indisponible — à vérifier manuellement sur au moins les scénarios déjà testés sur Claude dans `test-manuel-bot.md`).
- Logs `GPT usage in=... out=... cached=...` visibles à chaque appel, comparables en lisibilité aux logs Claude.