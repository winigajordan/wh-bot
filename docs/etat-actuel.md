# État actuel du projet

Photo de `whatsapp-bot` au 18 août 2026. Pour la liste des tâches : [avancement.md](./avancement.md). Specs : [specs.md](./specs.md). Refactor : [update1.md](./update1.md).

---

## En une phrase

Le **socle** tourne (NestJS + Redis + Postgres + schéma multi-tenant).  
Le **métier** (webhook WhatsApp, Claude, panier, dashboard) n’est pas encore branché.

L’app démarre, ping Redis et Postgres, charge les modules. La seule route HTTP utile pour l’instant est `GET /` (hello Nest).

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
| Config | `app` / `redis` / `database` via `.env` |
| Redis | Docker `redis:7-alpine` :6379, `RedisService` générique |
| Postgres | Local, base `whatsapp_bot` |
| TypeORM | Connexion + ping au boot |
| Migrations | Versionnées, déjà appliquées |

**Redis** sert de cache/session (clés + TTL). Il n’y a pas encore de session conversation métier (`session:{business_id}:{phone}`).

---

## Schéma actuel

```
users ──────────<1:1>──────── businesses ────────── modules
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    menu_items            delivery_zones            conversations
          │                       │                       │
          │                    orders ──────────────── messages
          │                       │
          │              order_status_history
```

- `modules` : seed `restaurant_ordering`
- `businesses` : ex-table `restaurants` + `timezone`, `onboarding_state`, `module_id`, `user_id` (nullable tant qu’il n’y a pas d’auth)
- `menu_items`, `delivery_zones`, `orders`, `conversations` : FK `business_id`

Tables **vides** de données métier (pas de business de test seedé).

---

## Organisation du code

```
src/
  config/                 config Nest (PORT, Redis, DB)
  redis/                  client ioredis générique
  database/               TypeORM + data-source + migrations
  businesses/             Business, User, PlatformModule
  module-registry/        ModuleDefinition + MODULE_REGISTRY
  restaurant-ordering/    tout ce qui est spécifique resto
    menu/
    orders/
    delivery-zones/
    restaurant-ordering.module-definition.ts
  conversation/           générique (entités seulement)
  webhook/                vide (Phase 1)
  claude/                 vide (Phase 2)
  whatsapp-client/        vide (Phase 1)
  dashboard-api/          vide (Phase 5)
```

**Générique** (ne doit pas connaître le resto) : `webhook`, `conversation`, `claude`, `businesses`, `module-registry`.

**Spécifique resto** : tout `restaurant-ordering/`. Un futur module s’ajoute au registre, sans modifier le pipeline WhatsApp → Claude.

Le prompt resto et les tools sont **déclarés en stub** (`getTools()` vide, prompt minimal). La vraie logique arrivera en phases 2–4.

---

## Ce qui n’est pas encore là

- Webhook Meta (challenge + HMAC + parsing)
- Envoi de messages WhatsApp
- Appels Claude / function calling
- CRUD menu / commandes / zones (entités seulement)
- Sessions Redis de conversation
- Dashboard Angular
- Login (table `users` prête, pas d’endpoints)

---

## Décisions déjà prises

- Postgres local, pas Docker
- Redis en Docker
- Migrations **commitées** (plus de régénération par environnement)
- Auth login reportée
- Pas de 2e module métier dans le MVP

---

## Prochaine étape

**Phase 1 — webhook WhatsApp**

1. Config Meta (`VERIFY_TOKEN`, `APP_SECRET`, `ACCESS_TOKEN` System User au niveau Business Portfolio)
2. `GET /webhooks/whatsapp` puis `POST` signé
3. `phone_number_id` → `business`
4. Session Redis `session:{business_id}:{client_phone}`
5. Wrapper Send API

Ensuite Phase 2 : `conversation` demande au registre le prompt/tools du module du business, puis appelle Claude.
