# Done — journal d’implémentation

Fichier de trace. **À chaque implémentation**, ajouter un bloc délimité par `##########`, du plus récent en haut.

Format d’un bloc :

- titre + date + heure
- ce qui a été fait exactement (fichiers, comportement, ce qui n’a **pas** été fait)

##########

## Send API — ack `Message reçu — {business.name}`

Date : 18 août 2026

### Objectif

Clôturer la phase 1 : après réception d’un message texte, renvoyer une confirmation WhatsApp via la Cloud API. Pas de Claude pour l’instant.

### Comportement

- `WhatsappClientService.sendTextMessage(phoneNumberId, to, body)`
- Appel `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`
- Header `Authorization: Bearer WHATSAPP_ACCESS_TOKEN`
- Corps : `messaging_product`, `to`, `type: text`, `text.body`
- Après session Redis : envoi `Message reçu — {business.name}` au client
- Erreur Send API → log, **pas** d’exception (Meta reçoit toujours `200`)

### Fichiers

- `src/whatsapp-client/whatsapp-client.service.ts` — `sendTextMessage`, `buildReceivedAckMessage`
- `src/whatsapp-client/whatsapp-client.service.spec.ts` — 3 tests
- `src/whatsapp-client/whatsapp-client.module.ts` — exporte le service
- `src/webhook/webhook.module.ts` — importe `WhatsappClientModule`
- `src/webhook/webhook.controller.ts` — appelle Send API après `appendUserMessage`
- `src/webhook/webhook.controller.spec.ts` — vérifie l’appel avec le bon texte

### Non fait (volontaire)

- Réponse Claude / tools
- Append `{ role: 'assistant' }` dans la session Redis
- Persist Postgres `messages`

##########

## Fix — session Redis écrite mais invisible dans Docker

Date : 18 août 2026

### Diagnostic

`appendUserMessage` **était bien appelé** (await, après lookup business `active`). Aucun `try/catch` silencieux dans la chaîne webhook → session → Redis.

`REDIS_URL=redis://localhost:6379` correspond au **port** Docker, mais pas au **processus** : un Redis Homebrew (`redis-server` PID local, Darwin 8.6.1) écoute `127.0.0.1:6379` et `[::1]:6379`. Nest et `redis-cli` parlent à celui-là. `docker compose exec redis redis-cli KEYS "*"` interroge un **autre** Redis (container Linux, vide).

La clé existait déjà : `session:c8924c45-805d-4fec-9add-98739a71f262:221771234567`

### Correctif (observabilité, pas un changement de cible)

- `ConversationSessionService.appendUserMessage` — log avant/après `setSession` avec la clé exacte
- `RedisService.setSession` — log `setSession <clé> ttl=… → OK`
- `RedisService.onModuleInit` — log `redis_version` + `os` ; **warn** si `os` contient Darwin
- `docker-compose.yml` / `.env.example` — commentaire sur la collision de port

Pour viser le container : `brew services stop redis` (libérer 6379) **ou** mapper Docker sur un autre port et changer `REDIS_URL`. Non fait ici — on ne coupe pas le Redis local.

### Non fait

- Changer le port Docker / `REDIS_URL`
- Arrêter le Redis Homebrew

##########

## Session Redis `session:{business_id}:{client_phone}`

Date : 18 août 2026

### Objectif

Charger ou créer la session de dialogue en Redis après résolution du business, et y stocker le message entrant. Specs §6 + §7 étape 4.

### Comportement

- Clé : `session:{business_id}:{client_phone}`
- TTL : 30 minutes (`SESSION_TTL_SECONDS = 1800`), rafraîchi à chaque message entrant
- Structure JSON :
  - `messages[]` — `{ role, content }` (on append `{ role: 'user', content }` pour l’instant)
  - `cart[]` — vide pour l’instant
  - `delivery_info` — `null` pour l’instant
  - `last_activity` — ISO timestamp mis à jour
- Session absente → création avec structure vide puis append
- Session existante → append + refresh TTL
- Appelé depuis le webhook uniquement si business `active`

### Fichiers

- `src/conversation/session.types.ts` — types, `buildSessionKey`, `SESSION_TTL_SECONDS`
- `src/conversation/conversation-session.service.ts` — `appendUserMessage`
- `src/conversation/conversation-session.service.spec.ts` — 2 tests
- `src/conversation/conversation.module.ts` — exporte `ConversationSessionService`
- `src/webhook/webhook.module.ts` — importe `ConversationModule`
- `src/webhook/webhook.controller.ts` — appelle `appendUserMessage` après lookup business
- `src/webhook/webhook.controller.spec.ts` — vérifie l’appel session

Réutilise `RedisService.setSession` / `getSession` existants.

### Non fait (volontaire)

- Wrapper Send API
- Réponse assistant dans `messages`
- Panier / `delivery_info` / Claude / persist Postgres

##########

## Webhook — lookup `phone_number_id` → Business

Date : 18 août 2026

### Objectif

Après parse du message texte, résoudre le tenant en base via `whatsapp_phone_number_id`. Specs §7 étape 2 + update1 §3.1.

### Comportement

- Pour chaque message texte parsé : `BusinessesService.findByWhatsAppPhoneNumberId(phoneNumberId)`
- Requête TypeORM sur `businesses.whatsapp_phone_number_id` (unique), relation `module` chargée pour la suite
- Business trouvé + `status === 'active'` → log avec `business.id`, `business.name`
- Business inconnu → `warn`, message ignoré
- Business non `active` → `warn`, message ignoré
- Meta reçoit toujours `200` + `{ "status": "ok" }` (même si business inconnu)



### Fichiers

- `src/businesses/businesses.service.ts` — `findByWhatsAppPhoneNumberId`
- `src/businesses/businesses.service.spec.ts` — 2 tests
- `src/businesses/businesses.module.ts` — exporte `BusinessesService`
- `src/webhook/webhook.module.ts` — importe `BusinessesModule`
- `src/webhook/webhook.controller.ts` — lookup après parse, handler POST async
- `src/webhook/webhook.controller.spec.ts` — tests lookup OK + business inconnu



### Non fait (volontaire)

- Session Redis `session:{business_id}:{client_phone}`
- Wrapper Send API
- Passage au module `conversation` / Claude

##########

## POST `/webhooks/whatsapp` — parse payload texte

Date : 18 août 2026

### Objectif

Après vérification HMAC, extraire du payload Meta les champs utiles pour le routing : `phone_number_id`, `from`, contenu texte. Specs §7 étape 2–3 (sans lookup business).

### Comportement

- Parse le JSON du body brut (déjà vérifié par HMAC)
- Parcourt `entry[].changes[].value`
- Pour chaque message `type === 'text'` avec `text.body` :
  - `phoneNumberId` ← `value.metadata.phone_number_id`
  - `from` ← `message.from`
  - `text` ← `message.text.body`
  - `messageId`, `timestamp` ← champs Meta
- Ignore : JSON invalide, `object` ≠ `whatsapp_business_account`, messages image/audio/statuts, payloads sans messages
- Log NestJS par message parsé (sans le corps du texte en log)
- Réponse Meta inchangée : `200` + `{ "status": "ok" }`



### Fichiers

- `src/webhook/whatsapp-webhook.types.ts` — types payload Meta + `ParsedIncomingTextMessage`
- `src/webhook/parse-whatsapp-webhook.util.ts` — `parseIncomingTextMessages(rawBody)`
- `src/webhook/parse-whatsapp-webhook.util.spec.ts` — 4 tests (OK, non-texte, vide, JSON invalide)
- `src/webhook/webhook.controller.ts` — appelle le parser après HMAC, log `messageId` / `from` / `phone_number_id`
- `src/webhook/webhook.controller.spec.ts` — 1 test POST avec payload message texte



### Non fait (volontaire)

- Lookup `phone_number_id` → `business_id`
- Session Redis `session:{business_id}:{client_phone}`
- Wrapper Send API / conversation / Claude

##########

## POST `/webhooks/whatsapp` — vérification HMAC

Date : 18 août 2026

### Objectif

Accepter les événements Meta uniquement si la signature `X-Hub-Signature-256` est valide. Specs §7 étape 1 du POST.

### Comportement

- Route : `POST /webhooks/whatsapp`
- Header Meta : `X-Hub-Signature-256` au format `sha256=<hex>`
- Calcul : `HMAC-SHA256(WHATSAPP_APP_SECRET, rawBody)` comparé avec `crypto.timingSafeEqual`
- Succès : `200` + `{ "status": "ok" }` (Meta exige une réponse rapide)
- Échec (signature absente, secret absent, rawBody absent ou invalide) : `403 Forbidden`
- Le JSON du body n’est **pas encore parsé** ni traité



### Fichiers

- `src/main.ts` — `NestFactory.create(AppModule, { rawBody: true })` pour conserver le corps brut
- `src/webhook/webhook-signature.util.ts` — `computeWebhookSignature`, `verifyWebhookSignature`
- `src/webhook/webhook.controller.ts` — handler POST `receive`
- `src/webhook/webhook-signature.util.spec.ts` — 4 tests util
- `src/webhook/webhook.controller.spec.ts` — 3 tests POST ajoutés (OK, mauvaise sig, sans rawBody)



### Test local

```bash
# Exporter WHATSAPP_APP_SECRET depuis .env, puis :
BODY='{"object":"whatsapp_business_account"}'
SIG=$(node -pe "const c=require('crypto');'sha256='+c.createHmac('sha256',process.env.WHATSAPP_APP_SECRET).update(process.argv[1]).digest('hex')" "$BODY")
curl -s -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

Attendu : `{"status":"ok"}` (avec `WHATSAPP_APP_SECRET` exporté depuis `.env`)

### Non fait (volontaire)

- Parse du payload (`phone_number_id`, `from`, contenu texte)
- Lookup `phone_number_id` → `business_id`
- Session Redis / Send API / conversation

##########

## GET `/webhooks/whatsapp` — challenge Meta

Date : 18 août 2026

### Objectif

Permettre à Meta de vérifier l’URL du webhook (handshake GET) avant d’envoyer des messages en POST. Specs §7.

### Comportement

- Route : `GET /webhooks/whatsapp`
- Query Meta : `hub.mode`, `hub.verify_token`, `hub.challenge`
- Succès (200, `Content-Type: text/plain`) si :
  - `hub.mode === 'subscribe'`
  - `hub.verify_token` égale `WHATSAPP_VERIFY_TOKEN` (comparaison `crypto.timingSafeEqual`)
  - `hub.challenge` est présent
- Sinon : `403 Forbidden`
- Corps de succès = la valeur brute de `hub.challenge` (pas de JSON)



### Fichiers

- `src/config/configuration.ts` — ajout de `whatsapp.verifyToken`, `whatsapp.appSecret`, `whatsapp.accessToken` (lus depuis `.env`)
- `src/webhook/webhook.controller.ts` — handler GET `verify`
- `src/webhook/webhook.module.ts` — `WebhookController` déclaré (le module était vide)
- `src/webhook/webhook.controller.spec.ts` — 3 tests : token OK, mauvais token, mode ≠ `subscribe`
- `.env.example` — clés `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` (valeurs vides)
- `.env` — renseigné par l’utilisateur (non versionné)

Les variables `APP_SECRET` et `ACCESS_TOKEN` sont dans la config mais **pas utilisées** dans ce GET. Elles serviront au POST (HMAC + Send API).

### Test local

```bash
curl "http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TON_VERIFY_TOKEN&hub.challenge=123456"
```

Attendu : `123456`

### Non fait (volontaire)

- `POST /webhooks/whatsapp`
- Vérification HMAC `X-Hub-Signature-256`
- Parse du payload (`phone_number_id`, `from`, texte)
- Lookup business / session Redis / Send API

##########