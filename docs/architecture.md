# whatsapp-bot — carte de l’API

Backend NestJS du bot WhatsApp resto et de l’API dashboard.  
Analyse du **code source** au 25 août 2026 (plus à jour que `etat-actuel.md` sur l’auth et le dashboard).

---

## Sommaire

1. [Vue d’ensemble](#vue-densemble)
2. [Pipeline bot](#pipeline-bot)
3. [Modules Nest](#modules-nest)
4. [Entités](#entités)
5. [Classes](#classes)
6. [HTTP / WebSocket](#http--websocket)
7. [Tools Claude](#tools-claude)

---

## Vue d’ensemble

En une phrase : backend NestJS **multi-tenant** — un webhook WhatsApp Cloud API, un business par numéro, un module métier (aujourd’hui `restaurant_ordering`). Claude commande via tools ; le dashboard Angular (`wini-food`) gère menu, zones et commandes en JWT + WebSocket.

| Chiffre | Valeur |
| --- | --- |
| Modules NestJS | 16 |
| Entités TypeORM | 11 |
| Tools Claude | 10 |
| Routes HTTP | 22 |

### Ce que le produit vise

Plateforme WhatsApp pour commerces. Règle d’or : **1 business = 1 numéro Cloud API = 1 module métier**.

Le webhook et Claude restent génériques ; le prompt et les tools viennent du registre. Un salon ou une banque s’ajouterait comme nouvelle `ModuleDefinition`, sans retoucher le pipeline.

### Deux surfaces

**Bot WhatsApp** (public Meta)  
Client écrit → Meta `POST /webhooks/whatsapp` → Redis + BullMQ → Claude + tools → Send API. Seuls les messages **texte** sont traités. Business `status !== active` : ignoré.

**Dashboard commerçant** (JWT)  
Login → CRUD menu / catégories / zones / extractions Vision, liste commandes, changement de statut. Socket.IO `/dashboard` pousse `order.created` et `order.updated` dans la room du business.

### Où vit l’état

| Store | Rôle |
| --- | --- |
| **Postgres** | Vérité métier : business, menu, zones, commandes |
| **Redis** | Session 30 min : messages Claude, panier, lock, flags |
| **BullMQ** | Debounce des messages WhatsApp |

Les tables `conversations` / `messages` existent mais **ne sont pas alimentées**. Redis suffit au bot en temps réel.

### Décisions d’architecture

| Règle | Pourquoi |
| --- | --- |
| Prix et dispo uniquement en base | Claude appelle `get_menu` / `confirm_order`. Jamais un prix inventé. |
| Panier = Redis, Order = Postgres | Éphémère 30 min jusqu’à confirmation explicite du client. |
| 1 webhook, N businesses | Lookup par `phone_number_id` Meta, pas une URL par resto. |
| Debounce 2,5 s + lock 120 s | Regroupe les messages WhatsApp rapides ; un seul Claude à la fois par fil. |
| `ModuleDefinition` isolée | Prompt + tools resto dans `restaurant-ordering`. `claude/` ne connaît pas le métier. |
| JWT scoped `businessId` | Chaque route dashboard lit `user.businessId`. Pas d’admin multi-resto. |

### Stack

| Couche | Choix | Notes |
| --- | --- | --- |
| Runtime | NestJS 11 / TypeScript | `PORT` 3000, CORS vers Angular 4200 |
| SQL | PostgreSQL + TypeORM | Migrations versionnées, pas de `synchronize` |
| Cache / jobs | Redis + ioredis + BullMQ | Sessions, locks, queue `conversation` |
| IA | Anthropic `claude-sonnet-4-6` | Tools loop + Vision menu |
| WhatsApp | Cloud API Graph v21.0 | HMAC `X-Hub-Signature-256`, `rawBody` |
| Dashboard API | JWT Passport + Socket.IO | namespace `/dashboard` |
| Front | `wini-food` (Angular 20) | Hors de ce repo backend |

### Dette volontaire

- Persist Postgres `conversations` / `messages` reportée.
- Phase 6 (notif WhatsApp au changement de statut) pas faite.
- Pas de register / refresh token.
- Extraction menu : images only, pas PDF multi-pages.

---

## Pipeline bot

Traitement **asynchrone** : le webhook répond `200` avant Claude. La boucle tools (Claude ↔ backend) peut faire plusieurs tours (défaut 8).

```
Meta Cloud API
    → WebhookController
        → Session Redis
        → BullMQ debounce
            → Processor
                → Orchestrateur
                    → ClaudeService ⇄ Tools resto
                → Send API
```

### Étapes

| # | Étape | Détail |
| --- | --- | --- |
| 1 | GET challenge | `hub.mode=subscribe` + `verify_token` timing-safe → `hub.challenge` |
| 2 | POST HMAC | `X-Hub-Signature-256` sur `rawBody`. Corps JSON WABA. |
| 3 | Parse | Uniquement `type=text`. Images / audio / boutons ignorés. |
| 4 | Lookup | `BusinessesService.findByWhatsAppPhoneNumberId`. `status=active` requis. |
| 5 | Session | `appendUserMessage` Redis, TTL 30 min, `last_whatsapp_message_id` = wamid |
| 6 | Debounce | Job delay `CONVERSATION_DEBOUNCE_DELAY_MS` (2500). Reprogrammé si nouveau SMS. |
| 7 | Worker | Lock `lock:conversation:{id}:{phone}` 120 s. Read + typing. `processConversation`. |
| 8 | Claude | Prompt module + max 8 tours tools. Fenêtre 20 messages, last = user. |
| 9 | Réponse | `appendAssistantMessage` (splice après snapshot) + `sendTextMessage` |
| 10 | Follow-up | Si messages pendant le job : nouveau job `__fu` après debounce |

Fichiers : `webhook.controller.ts`, `conversation-debounce.service.ts`, `conversation.processor.ts`, `conversation-orchestrator.service.ts`, `claude.service.ts`, `whatsapp-client.service.ts`.

### Branche commande confirmée

```
confirm_order
    → Revalidation menu
        → INSERT orders
            → order_status_history
            → EventEmitter
                → Gateway /dashboard
                    → wini-food
```

Échecs possibles de `confirm_order` : `not_confirmed`, `empty_cart`, `delivery_not_set`, `items_changed`, `invalid_items`.

Le prompt interdit de dire « commande passée » tant que `success: true` + `order_number` n’est pas revenu. Si la boucle tools s’épuise, un fallback texte + guard anti-fausse confirmation.

### Clés Redis

| Clé | TTL | Rôle |
| --- | --- | --- |
| `session:{businessId}:{clientPhone}` | 30 min | Messages, panier, livraison, note, wamid |
| `lock:conversation:{id}:{phone}` | 120 s | Un seul worker Claude par fil |
| `followup:conversation:{id}:{phone}` | 300 s | Message arrivé pendant un job `active` |
| BullMQ `conversation` / `process` | delay 2,5 s | jobId `{businessId}__{phone}` (+ `__fu`) |

---

## Modules Nest

`RedisModule` et `DatabaseModule` sont `@Global`. `ModuleRegistryModule` aussi, et il réimporte `RestaurantOrderingModule` (présent également à la racine).

```
AppModule
    ├── Redis + Database
    ├── BusinessesModule
    ├── ModuleRegistry ──► RestaurantOrdering
    ├── RestaurantOrdering
    ├── Conversation + Queue
    ├── Webhook + WhatsApp
    └── DashboardApi + Auth ──► RestaurantOrdering
```

### Catalogue

| Module | Chemin | Portée | Rôle | Exporte |
| --- | --- | --- | --- | --- |
| `AppModule` | `src/app.module.ts` | Racine | Compose Config, EventEmitter, Redis, Database et tous les domaines. CORS + `rawBody` dans `main.ts`. | `AppController` `GET /` |
| `DatabaseModule` | `src/database/database.module.ts` | Global | TypeORM Postgres, `autoLoadEntities`, `synchronize: false`. Ping `SELECT 1` au boot. | `DatabaseService` |
| `RedisModule` | `src/redis/redis.module.ts` | Global | ioredis `lazyConnect`. Sessions, locks, flags follow-up. | `REDIS_CLIENT`, `RedisService` |
| `BusinessesModule` | `src/businesses/businesses.module.ts` | Plateforme | Entités `User`, `Business`, `PlatformModule`. Lookup par `phone_number_id`, id, `userId`. | TypeORM, `BusinessesService` |
| `ModuleRegistryModule` | `src/module-registry/module-registry.module.ts` | Global | Mappe `modules.key` → `ModuleDefinition` (prompt + tools). Seul `restaurant_ordering` est enregistré. | Registry + ToolRegistry |
| `ConversationModule` | `src/conversation/conversation.module.ts` | Générique | Session Redis + orchestrateur Claude. Entités Conversation/Message enregistrées mais non écrites. | Session + Orchestrator |
| `ConversationQueueModule` | `src/conversation-queue/conversation-queue.module.ts` | Générique | BullMQ queue `conversation`. Debounce 2,5 s, lock Redis 120 s, follow-up. | `ConversationDebounceService` |
| `WebhookModule` | `src/webhook/webhook.module.ts` | Ingress | GET challenge Meta + POST HMAC. Parse texte only. Ignore business inconnu ou non `active`. | `WebhookController` |
| `ClaudeModule` | `src/claude/claude.module.ts` | IA | SDK Anthropic générique : boucle tools + Vision menu. Aucune connaissance resto. | `ClaudeService` |
| `WhatsappClientModule` | `src/whatsapp-client/whatsapp-client.module.ts` | Egress | Graph API v21.0 : send text, mark as read + typing. | `WhatsappClientService` |
| `RestaurantOrderingModule` | `src/restaurant-ordering/restaurant-ordering.module.ts` | Métier | Compose menu, panier, zones, commandes, tools Claude. | Menu, Orders, Zones, Cart, Tools |
| `MenuModule` | `src/restaurant-ordering/menu/menu.module.ts` | Métier | CRUD carte, catégories, extraction Vision. | `MenuService`, `MenuExtractionService` |
| `OrdersModule` | `src/restaurant-ordering/orders/orders.module.ts` | Métier | Entités `Order` + `OrderStatusHistory`. Logique dans `OrdersService` (parent). | TypeORM |
| `DeliveryZonesModule` | `src/restaurant-ordering/delivery-zones/delivery-zones.module.ts` | Métier | CRUD zones + matching quartier dans une adresse texte. | `DeliveryZonesService` |
| `AuthModule` | `src/auth/auth.module.ts` | Dashboard | JWT Passport. Login email/password, payload `{sub, businessId, email}`. Pas de register ni refresh. | `AuthService`, `JwtAuthGuard` |
| `DashboardApiModule` | `src/dashboard-api/dashboard-api.module.ts` | Dashboard | Contrôleurs JWT + gateway Socket.IO `/dashboard`. Routes scoped au `businessId` du token. | `AuthModule` |

### Extension d’un 2e métier

Interface `ModuleDefinition` : `key`, `buildSystemPrompt(business)`, `getTools()`, `onboardingSteps`.

Enregistrer dans `MODULE_REGISTRY` et brancher `ModuleToolRegistryService.execute`. Le webhook, la queue et `ClaudeService` ne changent pas.

Onboarding resto (définition, pas encore un wizard UI) :

| Étape | Ordre |
| --- | --- |
| `upload_menu` — Upload du menu | 1 |
| `review_extraction` — Review de l’extraction | 2 |
| `delivery_zones` — Zones de livraison | 3 |
| `first_test` — Premier test | 4 |

---

## Entités

`Business` est le hub. Couche **plateforme** (tous commerces) vs couche **restaurant_ordering**. Le panier n’est pas une table.

```
User ──────────────┐
PlatformModule ────┤
                   ▼
               Business
           ┌───────┼───────────────┐
           ▼       ▼               ▼
    Conversation*  MenuItem     DeliveryZone
           │       MenuCategory      │
           ▼       MenuExtraction    │
        Message*                     ▼
                                   Order
                                     │
                                     ▼
                             OrderStatusHistory
```

\* `Conversation` et `Message` : tables créées, **écriture non implémentée**.

### Catalogue

| Entité | Table | Couche | Écrite ? | Fichier |
| --- | --- | --- | --- | --- |
| `User` | `users` | Plateforme | Oui | `src/businesses/entities/user.entity.ts` |
| `PlatformModule` | `modules` | Plateforme | Oui | `src/businesses/entities/platform-module.entity.ts` |
| `Business` | `businesses` | Plateforme | Oui | `src/businesses/entities/business.entity.ts` |
| `Conversation` | `conversations` | Plateforme | Non | `src/conversation/entities/conversation.entity.ts` |
| `Message` | `messages` | Plateforme | Non | `src/conversation/entities/message.entity.ts` |
| `MenuItem` | `menu_items` | resto | Oui | `src/restaurant-ordering/menu/entities/menu-item.entity.ts` |
| `MenuCategory` | `menu_categories` | resto | Oui | `src/restaurant-ordering/menu/entities/menu-category.entity.ts` |
| `MenuExtraction` | `menu_extractions` | resto | Oui | `src/restaurant-ordering/menu/entities/menu-extraction.entity.ts` |
| `DeliveryZone` | `delivery_zones` | resto | Oui | `src/restaurant-ordering/delivery-zones/entities/delivery-zone.entity.ts` |
| `Order` | `orders` | resto | Oui | `src/restaurant-ordering/orders/entities/order.entity.ts` |
| `OrderStatusHistory` | `order_status_history` | resto | Oui | `src/restaurant-ordering/orders/entities/order-status-history.entity.ts` |
| `ConversationSession` | `session:{businessId}:{clientPhone}` | Redis | Redis | `src/conversation/session.types.ts` |

### User — `users`

Compte commerçant du dashboard. **1 user = 1 business.**

Relations : `Business.user_id` (1:1, unique, nullable).

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `email` | Identifiant login, unique |
| `password_hash` | bcrypt, jamais en clair |
| `created_at` | Horodatage |

### PlatformModule — `modules`

Catalogue des types de services. Pas un module Nest : une ligne en base. Le `key` doit matcher `MODULE_REGISTRY`.

Relations : `Business.module_id` (N:1).

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `key` | Identifiant technique unique (`restaurant_ordering`) |
| `name` | Libellé |
| `description` | Texte optionnel |
| `is_active` | Si false, plus d’onboarding |

### Business — `businesses`

Locataire central. Un commerce = un numéro WhatsApp = un module métier. Routing webhook via `whatsapp_phone_number_id`.

Relations : `User?`, `PlatformModule`, puis toutes les tables métier via `business_id`.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK — partout ailleurs : `business_id` |
| `user_id` | Compte dashboard, unique, nullable |
| `module_id` | Type de service |
| `name` | Nom affiché |
| `address` / `contact_phone` | Coordonnées humaines |
| `timezone` | Défaut `Africa/Dakar` |
| `whatsapp_phone_number_id` | Clé Meta unique (lookup webhook) |
| `whatsapp_waba_id` | WABA Meta |
| `status` | `onboarding` \| `active` \| `inactive` |
| `onboarding_state` | JSON de progression |

### Conversation — `conversations` (non écrite)

Fil client ↔ business. Schéma prêt, jamais alimenté : le bot vit dans Redis.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `business_id` | Quel commerce |
| `client_phone` | `from` du webhook |
| `status` | `active` \| `closed` |
| `last_message_at` | Tri / fenêtre 24 h Meta |
| `created_at` | Début du fil |

### Message — `messages` (non écrite)

Archive prévue du fil (debug / dashboard). Claude lit Redis, pas cette table.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `conversation_id` | Fil parent |
| `role` | `user` \| `assistant` |
| `content` | Texte, nullable si tool-only |
| `tool_calls` | JSON debug |
| `created_at` | Horodatage |

### MenuItem — `menu_items`

Source de vérité des plats, prix et dispo. Claude n’invente rien : `get_menu` lit ici. Le panier revalide contre cette table.

`category` est un **nom**, pas encore une FK vers `MenuCategory`.

| Champ | Rôle |
| --- | --- |
| `id` | UUID — `item_id` du panier |
| `business_id` | Quel resto |
| `category` | Libellé (Entrées, Grillades…) |
| `name` / `price` / `description` | Fiche plat |
| `available` | `false` = rupture, `add_to_cart` refuse |
| `options` | JSON variantes / suppléments |

### MenuCategory — `menu_categories`

Familles de la carte pour le dashboard et la nav `get_menu`. Unique `(business_id, name)`.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `business_id` | Quel resto |
| `name` | Nom unique par business |
| `created_at` / `updated_at` | Horodatage |

### MenuExtraction — `menu_extractions`

Brouillon Vision. Photo → Claude → review humaine → publish vers `menu_items`. Jamais publié brut.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `status` | `pending_review` \| `published` \| `discarded` |
| `source_filename` / `source_media_type` | Fichier source |
| `extracted_json` | Payload catégories + plats |
| `raw_model_text` | Réponse brute Vision |
| `published_at` | Null tant que non publié |

### DeliveryZone — `delivery_zones`

Quartiers livrables + frais. Matching **texte** (pas GPS). Si hors zone → proposer pickup.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `business_id` | Quel resto |
| `zone_name` | Nom quartier (Fass, Point E…) |
| `delivery_fee` | Frais, numeric, défaut 0 |

### Order — `orders`

Commande **confirmée** seulement. Avant ça le panier est Redis. Snapshot JSON figé à la confirmation.

| Champ | Rôle |
| --- | --- |
| `id` | UUID interne |
| `order_number` | Unique affiché (`CMD-0001`) |
| `client_phone` | Pour notif future |
| `items` | Snapshot JSON (nom, prix, qty, options) |
| `delivery_mode` | `delivery` \| `pickup` |
| `delivery_address` / `delivery_zone_id` | Livraison |
| `total` / `delivery_fee` | Calculés serveur |
| `status` | `received` → `preparing` → `ready` → `completed` \| `cancelled` |
| `note` | Allergies / consignes |

### OrderStatusHistory — `order_status_history`

Chaque transition de statut. Sert `get_order_status` et l’audit resto.

| Champ | Rôle |
| --- | --- |
| `id` | UUID PK |
| `order_id` | Commande |
| `status` | Statut à cet instant |
| `changed_at` | Quand |

### ConversationSession (Redis)

Mémoire courte du dialogue. TTL 30 min. Claude voit les **20 derniers messages**. Le panier vit ici jusqu’à `confirm_order`.

Clé : `session:{businessId}:{clientPhone}` — `src/conversation/session.types.ts`

| Champ | Rôle |
| --- | --- |
| `messages` | `[{role, content}]` user \| assistant |
| `cart` | `[{item_id, name, price, quantity, options}]` |
| `delivery_info` | mode, adresse, zone, frais |
| `order_note` | Note en cours |
| `last_whatsapp_message_id` | wamid pour read + typing |
| `last_activity` | ISO, rafraîchit le TTL |

### Cycle de vie commande

| Statut actuel | Transitions autorisées |
| --- | --- |
| `received` | `preparing`, `cancelled` |
| `preparing` | `ready` |
| `ready` | `completed` |
| `completed` | — |
| `cancelled` | — |

Annulation seulement depuis `received`. Le dashboard `PATCH` refuse le reste (`OrdersService.ORDER_STATUS_FLOW`).

---

## Classes

20 classes métier / infra hors entités TypeORM et hors specs.

| Classe | Type | Fait |
| --- | --- | --- |
| `WebhookController` | Controller | Vérifie Meta, parse les textes, lookup Business, append Redis, schedule debounce. Ack HTTP 200 immédiat. |
| `ConversationDebounceService` | Service | Un jobId par `(business, phone)`. Recule le délai si nouveau message. Si job active : flag follow-up. |
| `ConversationProcessor` | Worker | Lock Redis, typing WhatsApp, appelle l’orchestrateur, envoie la réponse, replanifie si messages arrivés pendant Claude. |
| `ConversationOrchestratorService` | Service | Résout `ModuleDefinition`, fenêtre 20 messages, appelle Claude avec `executeTool` du registry. |
| `ConversationSessionService` | Service | CRUD session Redis. Insère la réponse assistant après le snapshot vu par Claude. |
| `ModuleRegistryService` | Service | `resolve(moduleKey)` → prompt + tools. Throw si clé inconnue. |
| `ModuleToolRegistryService` | Service | Route l’exécution d’un tool vers `RestaurantOrderingToolsService`. Point d’extension pour un 2e module. |
| `ClaudeService` | Service | Boucle tools (défaut 8 tours) + fallback texte. Guard anti-fausse confirmation. `extractMenuFromImages` (Vision). |
| `WhatsappClientService` | Service | POST Graph messages : texte, `status=read` + `typing_indicator`. |
| `BusinessesService` | Service | `findByWhatsAppPhoneNumberId` / `findById` / `findByUserId`, relation `module` chargée. |
| `AuthService` | Service | bcrypt + JWT. Refuse un user sans business lié. |
| `JwtStrategy` / `JwtAuthGuard` | Auth | Remplit `AuthenticatedUser {userId, businessId, email}`. |
| `MenuService` | Service | `get_menu` (modes categories/items/full), CRUD dashboard, normalisation options, résolution options panier. |
| `MenuExtractionService` | Service | Upload 1–5 images → Vision → draft. Review PATCH puis publish `append` \| `replace`. |
| `CartService` | Service | Panier Redis. Validation UUID, dispo, options required. Prix = plat + suppléments. |
| `DeliveryZonesService` | Service | CRUD zones + `matchZoneInAddress`. Bloque delete si commandes liées. |
| `OrdersService` | Service | `confirm_order` revalide tout, snapshot, vide panier, émet `order.created`. Dashboard : list/filter/status. |
| `RestaurantOrderingToolsService` | Service | Adapter Claude → services métier. 10 tools. |
| `DashboardOrdersGateway` | Gateway | Socket.IO namespace `/dashboard`. Auth JWT handshake. Rooms `business:{id}`. |
| `RedisService` | Infra | set/get session TTL, lock NX, flags follow-up. |

### Utilitaires

| Fichier | Rôle |
| --- | --- |
| `webhook/parse-whatsapp-webhook.util.ts` | JSON WABA → messages texte |
| `webhook/webhook-signature.util.ts` | HMAC SHA-256 `X-Hub-Signature-256` |
| `restaurant-ordering/delivery-zones/zone-matching.util.ts` | Quartier dans adresse texte |
| `common/uuid.util.ts` | Garde-fou UUID avant requêtes TypeORM |
| `config/configuration.ts` | app, redis, database, whatsapp, anthropic, conversation, menu, jwt |
| `database/data-source.ts` | CLI TypeORM (migrations + seeds) |

### Seeds

| Script | Contenu |
| --- | --- |
| `npm run seed` | Module `restaurant_ordering` + businesses test |
| `npm run seed:menu` | Carte de démo |
| `npm run seed:zones` | Quartiers + frais |
| `npm run seed:users` | Users bcrypt liés aux businesses (login dashboard) |

---

## HTTP / WebSocket

Auth dashboard : Bearer JWT. Webhook : signature Meta, pas de JWT.  
Toutes les routes `/dashboard/*` sont filtrées sur le `businessId` du token — pas de paramètre tenant.

### Routes HTTP

| Méthode | Chemin | Classe | Rôle |
| --- | --- | --- | --- |
| GET | `/` | `AppController` | Health / hello Nest |
| GET | `/webhooks/whatsapp` | `WebhookController` | Challenge Meta (`verify_token`) |
| POST | `/webhooks/whatsapp` | `WebhookController` | Ingress HMAC, texte only |
| POST | `/auth/login` | `AuthController` | email + password → JWT + business |
| GET | `/auth/me` | `AuthController` | Profil + business du token |
| GET | `/dashboard/orders` | `DashboardOrdersController` | Liste, filtres status/date/limit |
| GET | `/dashboard/orders/:id` | `DashboardOrdersController` | Détail commande |
| PATCH | `/dashboard/orders/:id/status` | `DashboardOrdersController` | Transition statut |
| GET | `/dashboard/menu` | `DashboardMenuController` | Liste plats |
| POST | `/dashboard/menu` | `DashboardMenuController` | Créer plat |
| PATCH | `/dashboard/menu/:id` | `DashboardMenuController` | MAJ plat |
| PATCH | `/dashboard/menu/:id/availability` | `DashboardMenuController` | Rupture / dispo |
| GET | `/dashboard/menu/categories` | `DashboardMenuController` | Liste catégories |
| POST | `/dashboard/menu/categories` | `DashboardMenuController` | Créer catégorie |
| DELETE | `/dashboard/menu/categories/:id` | `DashboardMenuController` | Supprimer catégorie |
| POST | `/dashboard/menu/extractions` | `DashboardMenuExtractionsController` | Upload images → Vision |
| GET | `/dashboard/menu/extractions/:id` | `DashboardMenuExtractionsController` | Lire draft |
| PATCH | `/dashboard/menu/extractions/:id` | `DashboardMenuExtractionsController` | Corriger JSON |
| POST | `/dashboard/menu/extractions/:id/publish` | `DashboardMenuExtractionsController` | `append` \| `replace` |
| DELETE | `/dashboard/menu/extractions/:id` | `DashboardMenuExtractionsController` | discard |
| GET | `/dashboard/zones` | `DashboardZonesController` | Liste zones |
| POST | `/dashboard/zones` | `DashboardZonesController` | Créer zone + frais |
| PATCH | `/dashboard/zones/:id` | `DashboardZonesController` | MAJ zone |
| DELETE | `/dashboard/zones/:id` | `DashboardZonesController` | Supprimer si non utilisée |

### WebSocket — `DashboardOrdersGateway`

- Namespace : `/dashboard`
- Token via `handshake.auth.token` ou `Authorization: Bearer`
- Join `business:{id}`

| Event | Quand |
| --- | --- |
| `order.created` | `confirm_order` OK → `DASHBOARD_ORDER_CREATED` |
| `order.updated` | PATCH statut → `DASHBOARD_ORDER_UPDATED` |

### Payload JWT

| Champ | Sens |
| --- | --- |
| `sub` | `user.id` |
| `businessId` | business lié (1:1) |
| `email` | login |
| `exp` | `JWT_EXPIRES_IN`, défaut `7d` |

### Config (`.env`)

| Groupe | Variables |
| --- | --- |
| app | `PORT`, `NODE_ENV`, `CORS_ORIGIN` |
| redis | `REDIS_URL` |
| database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` |
| whatsapp | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` |
| anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `CLAUDE_TOOL_MAX_ITERATIONS` |
| conversation | `CONVERSATION_DEBOUNCE_DELAY_MS` |
| menu | `MENU_CATEGORY_NAV_MIN_ITEMS`, `MENU_CATEGORY_NAV_MIN_CATEGORIES` |
| jwt | `JWT_SECRET`, `JWT_EXPIRES_IN` |

---

## Tools Claude

Claude ne parle pas SQL. Chaque tool est un contrat JSON. Les prix unitaires panier = prix plat + somme des options. Le prompt impose le vouvoiement, l’interdiction d’inventer un plat, et un seul `add_to_cart` / `confirm_order` pour tout le ticket.

| Tool | Service | Contrat |
| --- | --- | --- |
| `get_menu` | `MenuService` | Sans category : nav catégories si carte longue. `category` : plats. `full: true` : carte complète. |
| `add_to_cart` | `CartService` | Tableau `items` (UUID + qty + options). Refuse le lot si un id/option invalide. |
| `remove_from_cart` | `CartService` | Retire par `item_ids`. |
| `clear_cart` | `CartService` | Vide panier, livraison et note. |
| `get_cart_summary` | `CartService` | `subtotal` + `delivery_fee` + `total` + note. Source des prix pour Claude. |
| `get_delivery_zones` | `DeliveryZonesService` | Quartiers + frais. |
| `set_delivery_info` | Zones + Cart | `delivery` \| `pickup`. Matching quartier, fixe `delivery_fee`. |
| `set_order_note` | Cart / session | Allergies, consignes. |
| `confirm_order` | `OrdersService` | `confirmed_by_client: true` obligatoire. Revalide prix/dispo/options. Crée `Order`, vide Redis. |
| `get_order_status` | `OrdersService` | Par `order_number`. |

### Modes `get_menu`

| Appel | `mode` | Usage WhatsApp |
| --- | --- | --- |
| `get_menu()` sans args, grande carte | `categories` | Familles + sample. Claude décrit, pas de prix. |
| `get_menu({ category })` | `items` | Plats d’une famille, `price_label`, options/choices. |
| `get_menu({ full: true })` ou petite carte | `full` | Carte complète. Seulement si le client le demande. |

Seuil nav catégories : `MENU_CATEGORY_NAV_MIN_ITEMS` (défaut 10) et `MENU_CATEGORY_NAV_MIN_CATEGORIES` (défaut 3). En dessous, `get_menu` sans filtre renvoie déjà `mode=full`.

### Prompt resto — contraintes clés

| Règle | Effet |
| --- | --- |
| Premier message | Se présenter comme assistant virtuel du resto |
| `item_id` = UUID `get_menu` | Pas de slug / nom inventé |
| Options required avant `add_to_cart` | Sinon `missing_required_options` |
| Récap avant confirm | Items, mode, frais, total, note optionnelle |
| Pas de confirmation verbale seule | Il faut `success` + `order_number` |
| Hors sujet | Orienter vers `contact_phone` du business |
| Wolof | Si le client écrit en wolof, répondre en wolof vouvoyé |

Prompt complet : `src/restaurant-ordering/restaurant-ordering.module-definition.ts`.
