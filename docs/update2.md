# Correction Phase 2 — Le system prompt doit vivre dans le module métier, pas dans `claude/`

> Ce document corrige/précise le découpage donné précédemment pour la Phase 2. Le module `claude/` doit rester générique (ne rien connaître du métier resto). Le system prompt et les tools appartiennent au module `restaurant-ordering/`, via un pattern de registre de modules — cohérent avec `whatsapp-bot-refactor-modules.md`.

## Pourquoi ce changement

Le plan initial proposait `src/claude/system-prompt.builder.ts`. C'est le mauvais emplacement : son contenu est 100% spécifique au métier resto, alors que `claude/` doit rester un simple client Anthropic générique, réutilisable par n'importe quel futur module (RDV, banque, etc.) sans jamais être modifié.

## Structure à mettre en place

```
src/
  claude/
    claude.service.ts
    → generateReply(systemPrompt: string, messages: {role, content}[], tools?: Anthropic.Tool[]): Promise<string>
    → ne contient AUCUNE logique ou texte propre au resto

  module-registry/
    module-definition.interface.ts
    module-registry.service.ts

  restaurant-ordering/
    restaurant-ordering.module-definition.ts
    → contient buildSystemPrompt() et getTools() pour ce module
```

## Interface `ModuleDefinition`

```typescript
// module-registry/module-definition.interface.ts
export interface ModuleDefinition {
  key: string; // doit correspondre à modules.key en base (ex: 'restaurant_ordering')
  buildSystemPrompt(business: Business): string;
  getTools(): Anthropic.Tool[]; // retourne [] pour l'instant, sera rempli en Phase 4
}
```

## Définition du module resto

```typescript
// restaurant-ordering/restaurant-ordering.module-definition.ts
export const restaurantOrderingModuleDefinition: ModuleDefinition = {
  key: 'restaurant_ordering',
  buildSystemPrompt(business) {
    return `Tu es l'assistant WhatsApp du restaurant ${business.name}.
Réponds de façon chaleureuse, directe et concise (adaptée à WhatsApp).
Tu n'as pas encore accès au menu ni à la prise de commande — 
si le client demande le menu ou veut commander, dis-lui poliment 
que cette fonctionnalité arrive bientôt.`;
  },
  getTools() {
    return [];
  },
};
```

## Registre central

```typescript
// module-registry/module-registry.service.ts
const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  restaurant_ordering: restaurantOrderingModuleDefinition,
};

@Injectable()
export class ModuleRegistryService {
  resolve(moduleKey: string): ModuleDefinition {
    const def = MODULE_REGISTRY[moduleKey];
    if (!def) {
      throw new Error(`Module inconnu: ${moduleKey}`);
    }
    return def;
  }
}
```

## Orchestrateur — utilise le registre au lieu d'appeler un builder statique

```typescript
// conversation/conversation-orchestrator.service.ts
async handleIncomingMessage(business: Business, from: string, text: string): Promise<string> {
  await this.sessionService.appendUserMessage(business.id, from, text);
  const session = await this.sessionService.getSession(business.id, from);

  const moduleDefinition = this.moduleRegistry.resolve(business.module.key);
  const systemPrompt = moduleDefinition.buildSystemPrompt(business);

  return this.claudeService.generateReply(systemPrompt, session.messages);
}
```

**Prérequis** : `business.module` doit être chargé (relation déjà chargée depuis `BusinessesService.findByWhatsAppPhoneNumberId`, confirmé fait en Phase 1).

## Ce qui ne change pas dans le reste du plan Phase 2

- `ClaudeService.generateReply` : signature et comportement identiques à ce qui était prévu, juste sans connaître le contenu du prompt
- `appendAssistantMessage` en session Redis : inchangé
- Remplacement de l'ack statique dans `webhook.controller.ts` par l'appel à l'orchestrateur : inchangé
- Persistance Postgres (`conversations` / `messages`) : inchangé en **spec**, mais **reporté volontairement** (22 août 2026) — voir [avancement.md](./avancement.md). Reprendre avant dashboard ou pilote.

## Impact sur les phases futures

Quand un futur module (ex: `appointment-booking/`) sera développé : créer son propre `*.module-definition.ts` avec son `buildSystemPrompt` et ses tools, l'ajouter une ligne dans `MODULE_REGISTRY`. Aucun fichier dans `claude/`, `conversation/`, ou `webhook/` ne doit être modifié pour ajouter un nouveau module métier — c'est le test de validation de ce pattern.