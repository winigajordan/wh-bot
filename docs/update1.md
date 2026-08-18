# Refactor — Architecture multi-tenant multi-module

> À donner à Cursor comme instructions de refactor sur le projet `whatsapp-bot` existant (Phase 0 déjà scaffoldée). Ce document complète `whatsapp-bot-resto-specs.md`, il ne le remplace pas — les sections non mentionnées ici (webhook, tools, system prompt, sessions Redis, revalidation commande) restent valables telles quelles, juste rescopées sur `business_id` au lieu de `restaurant_id`.

## 1. Contexte du changement

Le projet évolue d'un modèle "1 app = restaurants uniquement" vers un modèle **multi-tenant, multi-module** : la plateforme accueillera plusieurs types de commerces (restaurants, salons de beauté, banques, écoles...), chacun avec un module métier dédié (prise de commande, prise de RDV, diffusion d'infos...). Pour le MVP/POC, un seul module existe : `restaurant_ordering`.

**Règles de cardinalité actées :**
- 1 business = 1 module strictement (pas de multi-module par business pour l'instant)
- 1 user = 1 business strictement (pas de multi-business par user pour l'instant)
- 1 business = 1 `whatsapp_phone_number_id` unique (déjà le cas dans les faits, chaque resto a son propre numéro Meta)

## 2. Changements sur le schema de base de données

### 2.1 Renommer `restaurants` en `businesses`

Table généralisée. Ajouter les colonnes suivantes par rapport à l'ancienne table `restaurants` :

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id),
  module_id UUID REFERENCES modules(id) NOT NULL,
  name VARCHAR NOT NULL,
  address TEXT,
  contact_phone VARCHAR,
  timezone VARCHAR DEFAULT 'Africa/Dakar',
  whatsapp_phone_number_id VARCHAR UNIQUE NOT NULL,
  whatsapp_waba_id VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'onboarding', -- onboarding | active | inactive
  onboarding_state JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now()
);
```

**Seed data à insérer** (migration ou script de seed) :
```sql
INSERT INTO modules (key, name, description) VALUES
  ('restaurant_ordering', 'Commande Restaurant', 'Prise de commande automatisée pour restaurants via WhatsApp');
```

### 2.2 Renommer `restaurant_id` en `business_id` dans toutes les tables existantes

Tables concernées, sans autre changement de structure :
- `menu_items`
- `delivery_zones`
- `orders`
- `conversations`

Colonne `restaurant_id` → `business_id`, FK pointant maintenant vers `businesses(id)` au lieu de `restaurants(id)`.

### 2.3 `order_status_history` et `messages`

Aucun changement — elles référencent déjà `order_id` / `conversation_id`, pas de FK directe vers l'ancienne table `restaurants`.

## 3. Changements sur la structure des modules NestJS

### 3.1 Renommer le module `restaurants` en `businesses`

Le module `businesses` devient le module central générique. Il gère :
- L'entité `Business` (et `User`, `Module`)
- La résolution `whatsapp_phone_number_id → business` (utilisée par le webhook)
- Le statut et l'état d'onboarding du business

### 3.2 Introduire un registre de modules métier (pattern à mettre en place dès maintenant, même avec un seul module actif)

Créer un nouveau module NestJS `module-registry` (ou équivalent) contenant :

```typescript
export interface ModuleDefinition {
  key: string; // doit correspondre à modules.key en base
  buildSystemPrompt(business: Business): string;
  getTools(): Anthropic.Tool[];
  onboardingSteps: OnboardingStepDefinition[];
}

export interface OnboardingStepDefinition {
  key: string;
  label: string;
  order: number;
}
```

Créer un sous-module `restaurant-ordering/` qui implémente ce `ModuleDefinition` pour le module resto — c'est ici que vivent :
- Le system prompt builder du resto (celui déjà défini dans `whatsapp-bot-resto-specs.md` section 8)
- La déclaration des tools resto (`get_menu`, `add_to_cart`, `remove_from_cart`, `get_cart_summary`, `get_delivery_zones`, `set_delivery_info`, `confirm_order`, `get_order_status`)
- Les étapes d'onboarding resto (upload menu → review extraction → zones de livraison → premier test)

Un registre central mappe `module.key → ModuleDefinition` :

```typescript
export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  restaurant_ordering: restaurantOrderingModuleDefinition,
  // futurs modules viendront s'ajouter ici, aucun autre fichier à toucher
};
```

### 3.3 Impact sur le module `conversation`

Le flow devient :
```
Webhook résout business (via phone_number_id)
  → ConversationService résout business.module_id → module.key
  → MODULE_REGISTRY[module.key] fournit system prompt + tools
  → appel Claude avec ce prompt/tools
  → exécution des tool calls (délégués au sous-module correspondant, 
    ex: RestaurantOrderingService pour add_to_cart, confirm_order, etc.)
```

Le module `conversation` (webhook, résolution session Redis, orchestration Claude) reste **générique** et ne doit jamais contenir de logique spécifique à un module métier — toute la logique "restaurant" doit être isolée dans `restaurant-ordering/`.

### 3.4 Renommer les modules `menu` et `orders` (optionnel mais cohérent)

Pour bien marquer que ces modules sont spécifiques au métier resto (et non génériques comme `conversation` ou `businesses`), les déplacer/regrouper sous un dossier commun, par exemple :
```
src/modules/restaurant-ordering/
  menu/
  orders/
  delivery-zones/
  restaurant-ordering.module-definition.ts
```

## 4. Corrections à appliquer en même temps (déjà identifiées, hors scope du refactor mais à traiter maintenant)

### 4.1 Migrations TypeORM — arrêter de les gitignorer

`src/database/migrations/` ne doit plus être dans `.gitignore`. Les migrations doivent être committées et versionnées comme du code source : elles tracent l'historique des changements de schema et doivent être identiques entre dev, staging et prod. Ne jamais les régénérer différemment par environnement.

Action : retirer l'entrée du `.gitignore`, committer les migrations existantes, régénérer une migration propre pour ce refactor (`npm run migration:generate -- RefactorToBusinessesModules`).

### 4.2 Token WhatsApp — vérifier le scope System User

`WHATSAPP_ACCESS_TOKEN` en `.env` doit provenir d'un **System User créé au niveau du Business Portfolio** (Winiga Jordan), pas au niveau d'un WABA individuel — pour que ce token unique ait accès aux deux WABA existants (un par business/numéro). Si le token actuel a été généré au niveau d'un seul WABA, le régénérer avant la Phase 1.

## 5. Ce qui ne change pas

- Le flow webhook → session Redis → Claude → réponse reste identique dans sa mécanique générale (voir `whatsapp-bot-resto-specs.md` section 3 et 7)
- La logique de sessions Redis (clé `session:{business_id}:{client_phone}`, TTL 30 min) reste identique, juste `restaurant_id` → `business_id` dans le nommage de la clé
- Les tools resto, leurs schemas et la logique de revalidation à `confirm_order` restent identiques (section 9 du doc de specs original)
- Le dashboard reste 1 compte = 1 business, mais son contenu (écrans affichés) devra plus tard dépendre du module actif — pas nécessaire de le généraliser dès maintenant tant qu'un seul module existe

## 6. Ordre d'exécution recommandé pour ce refactor

1. Créer les tables `users` et `modules`, seed du module `restaurant_ordering`
2. Créer la nouvelle table `businesses`, migrer les données existantes de `restaurants` si des données de test y sont déjà présentes
3. Renommer `restaurant_id` → `business_id` dans `menu_items`, `delivery_zones`, `orders`, `conversations`
4. Committer les migrations (retirer du `.gitignore`)
5. Renommer le module NestJS `restaurants` → `businesses`
6. Créer la structure `module-registry` + `restaurant-ordering/` avec l'interface `ModuleDefinition`
7. Déplacer la logique menu/orders/delivery-zones existante sous `restaurant-ordering/`
8. Vérifier/régénérer le token WhatsApp au niveau du Business Portfolio
9. Reprendre la Phase 1 (webhook) en utilisant `business_id` partout