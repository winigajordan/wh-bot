# Avancement MVP — Bot WhatsApp Resto

Suivi de ce qui est fait et de ce qui reste. Photo de l’architecture : [etat-actuel.md](./etat-actuel.md). Specs : [specs.md](./specs.md). Refactor multi-tenant : [update1.md](./update1.md).

Tout le code vit dans `whatsapp-bot/`. L’auth **login/JWT** est reportée (la table `users` existe déjà pour le schéma).

Dernière mise à jour : 18 août 2026.

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

### Hors scope volontaire (déjà tranché)

- Postgres dans Docker → non
- Auth login/JWT dashboard → **plus tard** (table `users` déjà là)

### Phase 1 (en cours)

- Variables Meta dans `.env` (`VERIFY_TOKEN`, `APP_SECRET`, `ACCESS_TOKEN`)
- `GET /webhooks/whatsapp` — challenge Meta (`hub.verify_token` → `hub.challenge`)
- `POST /webhooks/whatsapp` — HMAC `X-Hub-Signature-256` (body brut, `rawBody: true`)

---

## À faire

### Avant / pendant la Phase 1

- [ ] `WHATSAPP_ACCESS_TOKEN` : System User au niveau du **Business Portfolio**, pas d’un WABA unique (accès aux deux WABA)

### Prochaine étape — Phase 1 (bloquante)

Webhook WhatsApp + routing `phone_number_id` → `business` + sessions Redis.

- [x] Variables Meta : `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`
- [x] `GET /webhooks/whatsapp` — challenge Meta
- [x] `POST /webhooks/whatsapp` — HMAC `X-Hub-Signature-256`
- [x] Parser : `phone_number_id`, `from`, contenu texte
- [x] Routing : `phone_number_id` → `business_id`
- [x] Seed de 2 businesses test (`restaurant_ordering`) — placeholders à remplacer par les vrais IDs Meta
- [x] Session Redis `session:{business_id}:{client_phone}` (TTL 30 min)
- [x] Wrapper Send API (envoi texte) — ack `Message reçu — {business.name}`

Le webhook résout le business ; `conversation` résoudra plus tard `module.key` → `MODULE_REGISTRY`.

### Phase 2 — Pipeline Claude (générique) + prompt/tools resto

- [ ] Client Anthropic `claude-sonnet-4-6`
- [ ] `conversation` orchestre sans logique resto
- [ ] `restaurant-ordering` fournit prompt + tools via `ModuleDefinition`
- [ ] Fenêtre glissante + persist `conversations` / `messages`
- [ ] Bout-en-bout WhatsApp → Claude → WhatsApp

### Phase 3 — Menu (sous `restaurant-ordering`)

- [ ] CRUD `menu_items`
- [ ] Upload image/PDF + extraction Vision + review humaine
- [ ] Tool `get_menu`

### Phase 4 — Panier / commandes (sous `restaurant-ordering`)

- [ ] Tools panier, zones, `confirm_order` (revalidation stricte), `get_order_status`
- [ ] WebSocket dashboard à la confirmation

### Phase 5 — Dashboard (sans auth login pour l’instant)

- [ ] App Angular
- [ ] Écrans commandes / menu / zones / review
- [ ] Plus tard : login 1 user = 1 business

### Phases 6–8

Notifications de statut, durcissement, pilote 2–3 businesses.

---

## Hors scope MVP

Voir specs §13. Pas de 2e module métier (`salon`, banque, école) pour le POC — le registre est prêt pour les ajouter plus tard.

---

## Ordre

**0 → 1 → 2** séquentielles. **3 et 4** en parallèle. **5** dès que les endpoints 3–4 sont stables.
