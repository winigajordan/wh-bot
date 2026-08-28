# Refactor — Abstraction AiService (Claude / GPT switchable par .env)

Contexte : le bot utilise aujourd'hui `ClaudeService` directement dans `ConversationOrchestratorService`. Objectif : introduire une interface `AiService` neutre, avec `ClaudeService` comme implémentation existante, et un nouveau `GptService` (implémentation **vide** pour l'instant — squelette seulement, pas d'appel OpenAI réel). Le provider actif est choisi via `.env` (`AI_PROVIDER=claude` par défaut).

Objectif de ce refactor : pouvoir comparer plus tard Claude et OpenAI sur les mêmes conversations, sans changer le reste du code (orchestrateur, tools, prompts).

## Contraintes à respecter

- Ne touche à aucune logique métier resto (`restaurant-ordering/`), aucun prompt, aucun tool. Le refactor est strictement dans la couche d'accès au modèle IA.
- Tout le code IA vit sous `src/ai/` (plus de dossier `src/claude/` dédié). `ClaudeService` y est déplacé / réexporté.
- `ClaudeService` doit continuer à fonctionner exactement comme avant (mêmes logs `Claude usage in=... out=... cache_write=... cache_read=...`, même comportement de boucle tool calling, même prompt caching).
- `GptService` doit compiler et être injectable. Tant qu'il n'est pas implémenté, `generateReply` **retourne** le texte fixe `Model gpt en cours d'implementation` (réponse client WhatsApp), **sans** lever d'exception et **sans** appel réseau OpenAI.
- Pas de nouvelle dépendance npm pour l'instant (pas de SDK OpenAI installé tant que `GptService` reste un squelette).
- Ne pas modifier `.env.example` de façon destructive : ajouter la nouvelle variable, ne rien supprimer.

## Injection Nest — token `AI_PROVIDER`

Nest injecte des **classes** (ou tokens), pas des interfaces TypeScript (effacées à l'exécution).  
On expose donc un token d'injection nommé **`AI_PROVIDER`** :

```typescript
export const AI_PROVIDER = Symbol('AI_PROVIDER');
```

- L'orchestrateur injecte `@Inject(AI_PROVIDER) private readonly ai: AiService`.
- Au boot, `AiModule` lit `config.get('ai.provider')` (`AI_PROVIDER` dans le `.env`) et enregistre derrière ce token l'instance `ClaudeService` ou `GptService`.
- Même nom que la variable d'env → lecture claire : « le provider IA actif ».

Ne pas utiliser `AI_SERVICE_TOKEN` (jargon peu parlant).

## Phase 1 — Interface AiService

Créer `src/ai/ai.service.interface.ts` avec :

```typescript
export interface AiToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiToolExecutor {
  execute(toolName: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface AiGenerateReplyParams {
  systemPrompt: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  executor?: AiToolExecutor;
}

export interface AiService {
  generateReply(params: AiGenerateReplyParams): Promise<string>;
}
```

Ce fichier ne dépend d'aucun SDK (ni Anthropic ni OpenAI) — types neutres uniquement.

## Phase 2 — ClaudeService dans `src/ai/` + implémente AiService

- Déplacer `ClaudeService` (et son module / specs) vers `src/ai/` (ex. `src/ai/claude/claude.service.ts` ou `src/ai/claude.service.ts`). Mettre à jour tous les imports.
- Faire en sorte que `ClaudeService` implémente `AiService`.
- Sa méthode `generateReply` existante doit correspondre à la signature de l'interface (adapter les noms de paramètres si besoin, sans changer son comportement interne : boucle tool calling, prompt caching, logs d'usage inchangés).
- Si la méthode actuelle a une signature différente (paramètres positionnels au lieu d'un objet), l'adapter en conservant tous les appelants existants fonctionnels — grep tous les usages de `claudeService.generateReply(` avant de changer la signature.
- Usages **Claude-only** (ex. extraction menu Vision `extractMenuFromImages`) : rester sur injection directe de `ClaudeService`, hors `AI_PROVIDER`.

## Phase 3 — GptService (squelette)

Créer `src/ai/gpt/gpt.service.ts` (ou `src/ai/gpt.service.ts`) + module associé :

- `GptService` implémente `AiService`.
- `generateReply` : `return 'Model gpt en cours d\'implementation';` — aucun `throw`, aucun SDK OpenAI, aucun appel réseau.
- Suivre le même pattern d'injection / module que Claude sous `src/ai/`.
- Ajouter un test `gpt.service.spec.ts` qui vérifie que `generateReply` retourne exactement ce message.

## Phase 4 — Module AiModule + sélection par .env

Créer `src/ai/ai.module.ts` :

```typescript
export const AI_PROVIDER = Symbol('AI_PROVIDER');
```

- `AiModule` importe les modules Claude / GPT internes, fournit `AI_PROVIDER` via une factory qui lit `config.get('ai.provider')` et retourne l'instance `ClaudeService` ou `GptService` correspondante.
- Valeurs acceptées : `claude` | `openai` (alias éventuel `gpt` → même squelette GPT, documenté).
- Si `ai.provider` est absent ou a une valeur inconnue, fallback sur `claude` avec un `Logger.warn` explicite (ne jamais planter le boot pour une valeur de config invalide).
- Exporter `AI_PROVIDER`.

Dans `src/config/configuration.ts` : ajouter `ai: { provider: process.env.AI_PROVIDER || 'claude' }`.

Dans `.env.example` : ajouter `AI_PROVIDER=claude` avec un commentaire `# claude | openai (openai : message placeholder pour l'instant)`.

## Phase 5 — Branchement dans l'orchestrateur

- Dans `ConversationOrchestratorService`, remplacer l'injection directe de `ClaudeService` par `@Inject(AI_PROVIDER) private readonly ai: AiService`.
- `ConversationModule` importe `AiModule`.
- Vérifier que les points d'appel de génération de réponse passent par `AI_PROVIDER`. Si certains usages sont spécifiques à Claude (Vision menu), les laisser sur `ClaudeService` et le documenter dans le rapport de fin de tâche.

## Tests à mettre à jour

- `conversation-orchestrator.service.spec.ts` : mocker `AI_PROVIDER` au lieu de `ClaudeService` pour la génération de réponses.
- Ajouter `ai.module.spec.ts` : factory → `ClaudeService` si `claude`, `GptService` si `openai`, `ClaudeService` + warning si valeur absente/invalide.
- `gpt.service.spec.ts` : retourne `Model gpt en cours d'implementation`.
- Ne pas casser les specs existantes de `claude.service.spec.ts` (chemins d'import mis à jour).

## Non fait (volontairement, à ne pas implémenter dans cette passe)

- Aucune implémentation réelle de `GptService` (pas de SDK OpenAI, pas d'appel Responses API, pas de conversion de format de tools vers le format OpenAI).
- Aucune conversion du prompt caching côté GPT.
- Aucun changement de comportement ou de prompt pour `restaurant-ordering`.
- Pas de bascule automatique/fallback entre providers en cas d'erreur runtime — le choix `.env` est statique au boot.
- Extraction menu Vision : laissé tel quel, toujours Claude-only pour l'instant.

## Validation attendue en fin de tâche

- `npm run build` sans erreur.
- Tests existants toujours verts.
- `AI_PROVIDER=claude` (ou variable absente) → comportement du bot strictement identique à avant ce refactor (mêmes logs, même flow WhatsApp).
- `AI_PROVIDER=openai` → le bot boote, et une conversation entrante reçoit le message texte `Model gpt en cours d'implementation` (Meta reçoit toujours 200 ; pas de crash Nest).
