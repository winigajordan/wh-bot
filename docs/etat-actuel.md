# État actuel du projet

Photo de `whatsapp-bot` au 22 août 2026. Pour la liste des tâches : [avancement.md](./avancement.md). Specs : [specs.md](./specs.md). Refactor : [update1.md](./update1.md).

---

## En une phrase

Le **socle** et le **pipeline conversationnel** tournent (webhook WhatsApp → Redis → Claude → Send API).  
Il reste le **métier commande** (menu, panier, confirmation) et le **dashboard**.

Route HTTP utile : `GET/POST /webhooks/whatsapp` (+ `GET /` hello Nest).

---

## Ce que le produit vise

Plateforme WhatsApp **multi-tenant, multi-module** :

- un **business** = un commerce (un numéro WhatsApp)
- un **module métier** = le type de service (`restaurant_ordering` pour le MVP)
- 1 business = 1 module, 1 user = 1 business (auth login **plus tard**)

Pour le POC, seul le module **prise de commande resto** existe. Le code est déjà découpé pour en ajouter d’autres (salon, banque…) sans toucher au webhook ni à Claude.

---

## Ce qui tourne vraiment

| Pièce | État |
| --- | --- |
| NestJS | OK, `npm run start:dev` |
| Config | `app` / `redis` / `database` / `whatsapp` / `anthropic` via `.env` |
| Redis | `REDIS_URL` → `localhost:6379`. Un Redis **Homebrew** occupe déjà ce port (Darwin) : Nest y écrit. Le container Docker `redis:7-alpine` tourne aussi mais `docker compose exec redis redis-cli` ne voit pas ces clés. |
| Postgres | Local, base `whatsapp_bot` |
| TypeORM | Connexion + ping au boot |
| Migrations | Versionnées, déjà appliquées |
| Webhook | Phase 1 + orchestrateur Claude : WhatsApp → registry → Claude → Send API. Ack fixe retiré. |

**Redis** = mémoire courte (messages récents pour Claude, panier futur, TTL 30 min).  
**Postgres** = mémoire longue (business, menu validé, commandes). Tables `conversations` / `messages` existent mais **ne sont pas alimentées** — persist reporté volontairement (voir [avancement.md](./avancement.md)).

Tables plateforme : module `restaurant_ordering` + **2 businesses test** (seed `npm run seed`). Pas de user (auth plus tard). Menu / commandes encore vides.

| Nom | `whatsapp_phone_number_id` | WABA | Statut |
| --- | --- | --- | --- |
| Chez Fatou | `test_phone_number_id_fatou` | `test_waba_id_fatou` | `active` |
| Teranga Grill | `test_phone_number_id_teranga` | `test_waba_id_teranga` | `active` |

Ce sont des **placeholders**. Quand tu auras les vrais IDs Meta, un `UPDATE` sur `businesses` suffit (clé unique = `whatsapp_phone_number_id`).

---

## Comment les entités s’emboîtent

Deux couches :

1. **Plateforme** (tous les types de commerces) : `User`, `PlatformModule`, `Business`, `Conversation`, `Message`
2. **Métier resto** (uniquement `restaurant_ordering`) : `MenuItem`, `DeliveryZone`, `Order`, `OrderStatusHistory`

```
User (compte dashboard, plus tard)
  └── 1:1 Business (le commerce + son numéro WhatsApp)
        ├── PlatformModule (ex. restaurant_ordering)
        ├── Conversation ── Message     ← fil WhatsApp client ↔ bot
        ├── MenuItem                    ← carte des plats
        ├── DeliveryZone                ← quartiers livrables
        └── Order ── OrderStatusHistory ← commandes confirmées
```

Exemple : « Chez Fatou » a un numéro WhatsApp. Un client écrit. On trouve le `Business` via `whatsapp_phone_number_id`, on ouvre une `Conversation`. Quand il confirme, on crée un `Order`. Le panier **avant** confirmation n’est **pas** une table : il vit dans Redis.

---

## Entités plateforme

### `User` — table `users`

Compte du commerçant pour le dashboard. **Pas de login pour l’instant** : la table est là pour le schéma (1 user = 1 business).

| Champ | Rôle |
| --- | --- |
| `id` | UUID |
| `email` | Identifiant de connexion, unique |
| `passwordHash` | Mot de passe hashé (jamais en clair) |
| `createdAt` | Date de création |

Un user pourra posséder **un seul** business (`businesses.user_id` unique). Tant qu’il n’y a pas d’auth, un business peut exister **sans** user (`user_id` nullable).

Fichier : `src/businesses/entities/user.entity.ts`

---

### `PlatformModule` — table `modules`

Catalogue des **types de services** que la plateforme sait faire. Ce n’est pas un module NestJS : c’est une ligne en base.

Aujourd’hui, une seule ligne (seed) :

| `key` | `name` |
| --- | --- |
| `restaurant_ordering` | Commande Restaurant |

Plus tard : `beauty_booking`, etc. Le `key` doit matcher le registre code `MODULE_REGISTRY`.

| Champ | Rôle |
| --- | --- |
| `id` | UUID |
| `key` | Identifiant technique unique |
| `name` | Libellé humain |
| `description` | Texte d’explication |
| `isActive` | Si `false`, plus d’onboarding sur ce module |

Fichier : `src/businesses/entities/platform-module.entity.ts`

---

### `Business` — table `businesses`

**Le locataire** : un resto (plus tard un salon, une école…). Ancienne table `restaurants`, généralisée.

C’est la pièce centrale du routing WhatsApp : Meta envoie `phone_number_id` → on cherche ce `Business` → on sait quel module (donc quel prompt / quels tools).

| Champ | Rôle |
| --- | --- |
| `id` | UUID. Partout ailleurs on parle de `business_id` |
| `userId` / `user` | Compte dashboard (vide tant qu’il n’y a pas d’auth) |
| `moduleId` / `module` | Type de service (`restaurant_ordering`) |
| `name` | Nom affiché (« Chez Fatou ») |
| `address` | Adresse du commerce |
| `contactPhone` | Téléphone **humain** : si le bot est hors-sujet, on redirige ici |
| `timezone` | Fuseau, défaut `Africa/Dakar` |
| `whatsappPhoneNumberId` | **Clé Meta** du numéro Cloud API. Unique. C’est ça qui identifie le business dans le webhook, pas l’URL |
| `whatsappWabaId` | Id du WABA Meta |
| `status` | `onboarding` (pas prêt) / `active` (le bot répond) / `inactive` (coupé) |
| `onboardingState` | JSON de progression (menu uploadé ? zones OK ? premier test ?) |
| `createdAt` | Date de création |

Règle : 1 business = 1 numéro WhatsApp = 1 module métier.

Fichier : `src/businesses/entities/business.entity.ts`

---

### `Conversation` — table `conversations`

Un **fil** entre un client WhatsApp et un business. Ce n’est pas le panier (Redis) : c’est l’identité du dialogue en base, pour l’historique et le debug.

Un même client qui écrit à deux commerces = deux conversations (deux `business_id`).

| Champ | Rôle |
| --- | --- |
| `id` | UUID |
| `businessId` / `business` | Quel commerce |
| `clientPhone` | Numéro WhatsApp du client (`from` du webhook) |
| `status` | `active` ou `closed` |
| `lastMessageAt` | Dernier message (tri, fenêtre 24 h Meta) |
| `createdAt` | Début du fil |

Fichier : `src/conversation/entities/conversation.entity.ts`  
Générique : un salon aura aussi des conversations, le format ne change pas.

---

### `Message` — table `messages`

Chaque message du fil, **à persister en Postgres** (async, prévu specs §6) — **pas encore implémenté** (reporté). Redis garde les N derniers pour Claude (coût tokens) + TTL 30 min.

| Champ | Rôle |
| --- | --- |
| `id` | UUID |
| `conversationId` / `conversation` | Fil parent |
| `role` | `user` (client) ou `assistant` (bot) |
| `content` | Texte. Peut être vide si le tour n’était que des tool calls |
| `toolCalls` | JSON des outils Claude (debug : `add_to_cart`, etc.) |
| `createdAt` | Horodatage |

Pas de `business_id` ici : on passe par la conversation.

Fichier : `src/conversation/entities/message.entity.ts`

---

## Entités métier resto (`restaurant-ordering`)

Uniquement pour un business en `restaurant_ordering`. Un futur module « RDV salon » aurait d’autres tables (prestations, créneaux), pas un menu de plats.

### `MenuItem` — table `menu_items`

Un plat / une boisson de la carte **validée**. Source de vérité des **prix** et de la **dispo**. Claude n’invente pas un plat : il passe par `get_menu`, qui lit cette table.

Flux prévu : photo/PDF → Claude Vision → review humaine → **puis** insertion ici. Jamais publier l’extraction brute.

| Champ | Rôle |
| --- | --- |
| `id` | UUID du plat (`item_id` dans le panier Redis) |
| `businessId` / `business` | Quel resto |
| `category` | Ex. « Entrées », « Grillades » |
| `name` | Nom du plat |
| `price` | Prix réel. Le total commande doit venir d’ici, pas du modèle |
| `description` | Texte optionnel |
| `available` | `false` = rupture. `add_to_cart` / `confirm_order` doivent échouer |
| `options` | JSON variantes / suppléments (`[]` par défaut) |
| `createdAt` / `updatedAt` | Un changement de prix sert à la revalidation à la confirmation |

Fichier : `src/restaurant-ordering/menu/entities/menu-item.entity.ts`

---

### `DeliveryZone` — table `delivery_zones`

Liste des **quartiers** livrés. Pas de GPS. Texte : « Fass », « Point E », « Médina ».

À la livraison, le backend **matche** le quartier du client à cette liste (`set_delivery_info`). Claude ne décide pas tout seul si la zone est couverte.

| Champ | Rôle |
| --- | --- |
| `id` | UUID |
| `businessId` / `business` | Quel resto |
| `zoneName` | Nom du quartier |

Si le quartier n’est pas dans la liste → proposer le **retrait** (`pickup`).

Fichier : `src/restaurant-ordering/delivery-zones/entities/delivery-zone.entity.ts`

---

### `Order` — table `orders`

Une commande **confirmée**. Avant ça, le panier n’existe que dans Redis. `confirm_order` revalide prix + dispo, **puis** crée cette ligne et vide le panier.

| Champ | Rôle |
| --- | --- |
| `id` | UUID interne |
| `businessId` / `business` | Quel resto |
| `clientPhone` | Client à notifier quand le statut change |
| `orderNumber` | Numéro unique affiché (« CMD-1042 ») |
| `items` | **Snapshot JSON** au moment de la commande (nom, prix, qty, options). Le ticket est figé, on ne recalcule pas depuis le menu plus tard |
| `deliveryMode` | `delivery` ou `pickup` |
| `deliveryAddress` | Adresse texte si livraison |
| `deliveryZoneId` / `deliveryZone` | Quartier matché (`null` en retrait) |
| `total` | Total calculé côté serveur à la confirmation |
| `status` | `received` → `preparing` → `ready` → `completed` |
| `createdAt` | Date de confirmation |

Le resto changera le statut depuis le dashboard ; ça déclenchera une notif WhatsApp (Phase 6).

Fichier : `src/restaurant-ordering/orders/entities/order.entity.ts`

---

### `OrderStatusHistory` — table `order_status_history`

Historique des statuts. Chaque passage « en préparation », « prêt », etc. = une ligne. Utile pour le client (`get_order_status`) et le resto.

| Champ | Rôle |
| --- | --- |
| `id` | UUID |
| `orderId` / `order` | Commande concernée |
| `status` | Statut à cet instant |
| `changedAt` | Quand ça a changé |

Pas de `business_id` : on passe par la commande.

Fichier : `src/restaurant-ordering/orders/entities/order-status-history.entity.ts`

---

## Ce qui n’est pas une entité

| Chose | Où ça vit | Pourquoi |
| --- | --- | --- |
| Panier (`cart`) | Redis, 30 min | Éphémère ; devient `Order` seulement après confirmation |
| Infos livraison en cours | Redis `delivery_info` | Idem, copiées sur l’`Order` à la confirmation |
| Historique court pour Claude | Redis | N derniers tours, pour limiter les tokens |
| Historique complet | table `messages` | Debug / preuve, pas tout renvoyé à Claude |
| Session WhatsApp | Redis `session:{business_id}:{client_phone}` | Relie panier + messages le temps du dialogue |

---

## Organisation du code

```
src/
  businesses/             User, PlatformModule, Business
  conversation/           Conversation, Message (générique)
  restaurant-ordering/    MenuItem, DeliveryZone, Order, OrderStatusHistory
  module-registry/        quel prompt/tools selon modules.key
  webhook / whatsapp-client   (phase 1 — branché)
  claude/                     generateReply générique (branché via orchestrateur)
  dashboard-api               (encore vide)
```

---

## Décisions reportées

| Sujet | Décision | Reprendre quand |
| --- | --- | --- |
| Persist Postgres `conversations` / `messages` | Reporté (22 août 2026) — Redis suffit pour le bot ; archive utile surtout pour dashboard et debug pilote | Avant Phase 5 ou pilote restos réels |
| Auth login/JWT | Reporté dès le départ | Avec le dashboard |

---

## Prochaine étape

**Phase 5 — Dashboard** (ou test bout-en-bout commande WhatsApp). WebSocket reporté avec le dashboard.
