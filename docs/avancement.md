# Avancement MVP — Bot WhatsApp Resto

Suivi de ce qui est fait et de ce qui reste. Photo de l’architecture : [etat-actuel.md](./etat-actuel.md). Specs : [specs.md](./specs.md). Refactor multi-tenant : [update1.md](./update1.md).

Tout le code backend vit dans `whatsapp-bot/`. Frontend dashboard : `wini-food/` (Angular 20).

Dernière mise à jour : 25 août 2026.

---

## Stabilisation bot — validée

Checklist : [test-manuel-bot.md](./test-manuel-bot.md) — **tous les scénarios OK** (24 août 2026).

- [x] Tool `clear_cart`
- [x] Limite tools configurable + prompt budget + fallback texte sans tools
- [x] Debounce BullMQ
- [x] Accusé de lecture + indicateur typing WhatsApp
- [x] Validation manuelle checklist complète
- [ ] `WHATSAPP_ACCESS_TOKEN` System User niveau Business Portfolio (si multi-WABA)

**Prochaine étape : Phase 5 — Dashboard.**

---

## Fait

### Phase 0 — Setup

- Scaffold NestJS TypeScript
- Config minimale (`src/config/configuration.ts`) : `app`, `redis`, `database`, `whatsapp`
- Redis : Docker (`redis:7-alpine`, port 6379), `RedisModule` global, `RedisService` générique, ping au boot
- PostgreSQL **local** (pas Docker) : base `whatsapp_bot`, TypeORM, ping au boot
- Migrations TypeORM **versionnées** (`src/database/migrations/`) :
  - `npm run migration:generate`
  - `npm run migration:run`
  - `npm run migration:revert`
  - `npm run migration:show`

### Refactor multi-tenant (update1)

- Tables `users`, `modules`, `businesses` (ex-`restaurants`)
- Seed module `restaurant_ordering`
- `restaurant_id` → `business_id` sur `menu_items`, `delivery_zones`, `orders`, `conversations`
- Module NestJS `businesses` : `Business`, `User`, `PlatformModule`
- Registre `module-registry` + `ModuleDefinition`
- Logique resto isolée dans `src/restaurant-ordering/` (`menu`, `orders`, `delivery-zones`, definition)
- `conversation` reste générique
- Seed de 2 businesses test (`npm run seed`) : Chez Fatou, Teranga Grill — `restaurant_ordering`, `user_id` null, `phone_number_id` placeholders

### Phase 1 — Webhook WhatsApp

- Variables Meta dans `.env` (`VERIFY_TOKEN`, `APP_SECRET`, `ACCESS_TOKEN`)
- `GET /webhooks/whatsapp` — challenge Meta (`hub.verify_token` → `hub.challenge`)
- `POST /webhooks/whatsapp` — HMAC `X-Hub-Signature-256` (body brut, `rawBody: true`)
- Parse payload → lookup `business` par `phone_number_id`
- Sessions Redis (`session:{business_id}:{client_phone}`, TTL 30 min)
- Send API (réponse Claude au client)

### Phase 2 — Pipeline Claude (update2)

- `ANTHROPIC_API_KEY` + `ClaudeService.generateReply` générique (`claude-sonnet-4-6`)
- `restaurant-ordering` : prompt (ton serveur sympa, présentation assistant virtuel au 1er message)
- `ModuleRegistryService.resolve`
- Orchestrateur `conversation` (remplace l’ack fixe)
- Fenêtre glissante (20 derniers messages vers Claude)

### Hors scope volontaire (déjà tranché)

- Postgres dans Docker → non
- Auth login/JWT dashboard → **fait** (25 août 2026) — voir Phase 5

### Reporté volontairement (ne pas oublier)

- **Persist Postgres `conversations` / `messages`** — reporté le 22 août 2026. Redis suffit pour le bot en temps réel ; l’archive Postgres servira surtout au dashboard (Phase 5) et au debug en pilote. Tables déjà en schéma, jamais alimentées. **Reprendre avant dashboard ou pilote restos réels.**

---

## À faire

### Avant / pendant la Phase 1

- [ ] `WHATSAPP_ACCESS_TOKEN` : System User au niveau du **Business Portfolio**, pas d’un WABA unique (accès aux deux WABA)

### Phase 2 — clôture (reste optionnel)

- [ ] Persist Postgres `conversations` / `messages` → **reporté** (voir ci-dessus)
- [ ] Bout-en-bout WhatsApp → Claude → WhatsApp (validation avec vrais IDs Meta)

### Phase 3 — Menu (sous `restaurant-ordering`) — cœur fait

- [x] `MenuService.getMenu` (groupé par catégorie, filtre optionnel)
- [x] Tool `get_menu` + boucle tool calling Claude
- [x] Seed menu test (`npm run seed:menu`)
- [x] Prompt resto mis à jour (menu via tool, commande pas encore dispo)
- [ ] Upload image/PDF + extraction Vision + review humaine (dashboard)
- [ ] Endpoints CRUD HTTP menu (dashboard)

### Phase 4 — Panier / commandes (sous `restaurant-ordering`) — cœur fait

- [x] `CartService` (panier Redis via session)
- [x] Tools : `add_to_cart`, `remove_from_cart`, `clear_cart`, `get_cart_summary`
- [x] `DeliveryZonesService` + matching quartier + seed (`npm run seed:zones`)
- [x] Tools : `get_delivery_zones`, `set_delivery_info`
- [x] `OrdersService` + `confirm_order` (revalidation stricte) + `get_order_status`
- [x] Prompt resto : flow commande complet
- [ ] WebSocket dashboard à la confirmation

### Phase 5 — Dashboard ← **en cours**

- [x] Auth JWT (`POST /auth/login`, `GET /auth/me`, guard)
- [x] Seed users liés aux businesses (`npm run seed:users`)
- [x] API commandes (`GET/PATCH /dashboard/orders`)
- [x] App Angular `wini-food` — login + shell dashboard Commandes
- [x] Liste commandes Angular branchée sur l’API (+ changement de statut)
- [ ] WebSocket nouvelle commande
- [ ] Écrans menu / zones / review
- [ ] Plus tard : register / refresh token

**Prochaine étape : WebSocket « nouvelle commande ».**

---

## Hors scope MVP

Voir specs §13. Pas de 2e module métier (`salon`, banque, école) pour le POC — le registre est prêt pour les ajouter plus tard.

---

## Ordre

**0 → 1 → 2** : fait (Phase 2 considérée suffisante sans persist Postgres).  
**3 et 4** : cœur fait. **Stabilisation bot** : validée.  
**Persist messages** : avant Phase 5 ou pilote.  
**5** : prochaine étape.
