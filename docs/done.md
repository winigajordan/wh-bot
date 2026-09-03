# Done — journal d’implémentation

Fichier de trace. **À chaque implémentation**, ajouter un bloc délimité par `##########`, du plus récent en haut.

Format d’un bloc :

- titre + date + heure
- ce qui a été fait exactement (fichiers, comportement, ce qui n’a **pas** été fait)

##########

## Persist messages Postgres — archive async V1

Date : 3 septembre 2026, 04:07

### Comportement

- Après chaque `appendUserMessage` / `appendAssistantMessage` Redis, archive fire-and-forget en Postgres
- `findOrCreate` conversation `active` par `(business_id, client_phone)` ; insert `messages` (`tool_calls = null`)
- Échec Postgres loggé, jamais propagé (chemin WhatsApp inchangé)
- Index unique partiel `UQ_conversations_business_phone_active` + retry sur course 23505
- **Stockage en clair** : `messages.content` (`text`) et `conversations.client_phone` sans chiffrement applicatif (V1 archive / debug)

### Fichiers

- `src/conversation/conversation-persistence.service.ts` (+ spec)
- `src/conversation/conversation-session.service.ts` (+ spec)
- `src/conversation/conversation.module.ts`
- `src/conversation/entities/message.entity.ts` — `content` text nullable
- `src/database/migrations/1787003000000-AddActiveConversationUniqueIndex.ts`
- `docs/avancement.md`

### Non fait (volontaire)

- Restore historique Redis depuis Postgres après TTL
- API / UI dashboard conversations
- Persist des `tool_calls` bruts
- Fermeture / réouverture de conversations (`closed`)
- Chiffrement au repos (AES applicatif, `pgcrypto`, disque chiffré)

### Validation

- Tests `conversation-persistence` + `conversation-session` verts
- Suite complète : 154 tests verts
- `npm run migration:run` — index unique appliqué

##########

## Fix GPT — astérisques visibles + fluidité v2

Date : 28 août 2026, 02:35

### Contexte

CMD-0016 : astérisques WhatsApp affichés en clair (`*Grillades*`, `*Total : 7 500 F*`), menu en catalogue à puces, ton « a été ajoutée à votre panier » malgré le 1er recalibrage fluidité.

### Comportement

- `STYLE_OVERRIDES.openai` réécrit :
  - **Interdiction totale des `*`** (texte brut uniquement) — les exemples few-shot ne contiennent plus d’astérisques (le 1er recalibrage en montrait encore dans le « mauvais » exemple, GPT les copiait)
  - Catégories en phrases enchaînées, pas `• Catégorie : …`
  - Plats : `Nom — price_label` sur lignes simples, sans puces ni listes d’ingrédients exhaustives
  - Confirmations courtes (« C’est noté pour la César »), récap complet uniquement avant validation finale
  - Zones livraison en phrase fluide, pas liste à puces
  - Accueil moins robot (« bienvenue — qu’est-ce qui vous ferait plaisir ? »)
- `sanitizeWhatsappText()` étendu : retire `*gras*`, `_italique_`, `~barré~` avant envoi (filet de sécurité provider-agnostique)

### Fichiers

- `src/restaurant-ordering/restaurant-ordering.module-definition.ts` — `OPENAI_STYLE_DIRECTIVES`
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts`
- `src/conversation/sanitize-whatsapp-text.ts` (+ spec)

### Non fait (volontaire)

- Modification Claude / règles métier
- Suppression des puces `•` au sanitizer (autorisées si le modèle en met)

### Validation

- `npm test` — 138 tests verts
- `npm run build` — OK
- Retest manuel flow menu → panier → livraison → confirmation avec `AI_PROVIDER=openai`

##########

## Recalibrage STYLE_OVERRIDES.openai — fluidité conversationnelle

Date : 28 août 2026, 02:17

### Comportement

- Réécriture `STYLE_OVERRIDES.openai` (CMD-0015) : principe liste/prose au jugement du modèle, non-répétition des infos déjà connues, réaction au message client, gras limité, pas d’emoji statut
- Exemple few-shot Médina (mauvaise vs bonne réponse)
- Puces réautorisées (retrait de l’interdiction v1)
- `sanitizeWhatsappText()` : emoji ✅/❌/🎉 après « confirmé(e) »

### Fichiers

- `docs/recalibrage-style-gpt-fluidite.md` — spec
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/conversation/sanitize-whatsapp-text.ts` (+ spec)

### Non fait (volontaire)

- `DEFAULT_STYLE_DIRECTIVES` / règles métier inchangés
- Tests A/B automatisés du style

### Validation

- Tests module-definition + sanitizer verts
- Supersédé partiellement par le fix astérisques v2 (02:35)

##########

## Prompt modulaire — style overridable par provider (GPT naturel)

Date : 28 août 2026, 01:50

### Comportement

- `buildSystemPrompt` découpé en blocs : identité, règles métier (source unique, jamais overridable), style, footer
- `DEFAULT_STYLE_DIRECTIVES` = style Claude actuel, mot pour mot (non-régression `AI_PROVIDER=claude`)
- `STYLE_OVERRIDES.openai` : consignes GPT plus strictes (anti `#` / puces / gras systématique / reçu de caisse) + ton **conversation humaine** (serveur qui tape sur WhatsApp, phrases courtes, réaction au client)
- Présentation menu GPT en prose (« Pour les grillades, on a… ») — pas de titres Markdown ni en-têtes MAJUSCULES isolés
- Type `AiProvider` (`claude` | `openai`) dans `ai.constants.ts`
- `resolveAiProviderKey()` — orchestrateur passe le provider à `buildSystemPrompt(business, provider)`
- `sanitizeWhatsappText()` — filet de sécurité provider-agnostique : supprime `#`… en début de ligne avant envoi WhatsApp

### Fichiers

- `docs/prompt-style-override-par-provider.md` — spec
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts` — blocs + `DEFAULT_STYLE_DIRECTIVES` + `STYLE_OVERRIDES`
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts` — claude identique / openai override injecté
- `src/module-registry/module-definition.ts` — `buildSystemPrompt(business, provider?)`
- `src/ai/ai.constants.ts`, `src/ai/ai.provider.ts` (+ spec `resolveAiProviderKey`)
- `src/conversation/conversation-orchestrator.service.ts` (+ spec) — provider + sanitization
- `src/conversation/sanitize-whatsapp-text.ts` (+ spec)

### Non fait (volontaire)

- Override style pour d’autres providers (Mistral, Gemini)
- Tests A/B automatisés du style
- Modification des règles métier partagées

### Validation

- `npm test` — 136 tests verts
- `npm run build` — OK
- Test WhatsApp manuel `AI_PROVIDER=openai` : comparer visuellement avec cas CMD-0014 (plus de `###`, ton plus naturel)

##########

## GptService — OpenAI Responses API (gpt-5.6-terra)

Date : 28 août 2026, 01:25

### Comportement

- `GptService` remplace le squelette placeholder : appels réels via SDK `openai` et **Responses API**
- Modèle par défaut : `gpt-5.6-terra` (`OPENAI_MODEL`)
- `AI_PROVIDER=openai` → conversations WhatsApp passent par GPT ; `claude` inchangé (non-régression)
- Conversion interne `AiToolDefinition` → `{ type: 'function', name, description, parameters, strict: false }`
- Boucle tool calling :
  - 1er appel : `responses.create({ model, instructions, input, tools })`
  - `function_call` → exécution executor → `function_call_output` avec `previous_response_id`
  - Parallèle : tous les `function_call` d’un tour exécutés avant le prochain appel
  - Limite : réutilise `CLAUDE_TOOL_MAX_ITERATIONS` ; fallback sans tools + garde-fous `confirm_order` (identique Claude)
- Logs DEBUG : `GPT usage in=X out=Y cached=Z` (`input_tokens_details.cached_tokens`)
- Clé absente → throw `OPENAI_API_KEY manquante`

### Fichiers

- `docs/implementation-gpt-service.md` — spec
- `src/ai/gpt/gpt.service.ts` — implémentation complète
- `src/ai/gpt/gpt.service.spec.ts` — 6 tests (simple, tools, boucle, parallèle, limite, clé)
- `src/config/configuration.ts` — bloc `openai: { apiKey, model }`
- `.env.example` — `OPENAI_API_KEY`, `OPENAI_MODEL`
- `package.json` — dépendance `openai`

### Non fait (volontaire)

- `strict: true` sur les tools
- Streaming
- Vision menu via GPT (reste Claude-only)
- Fallback automatique Claude↔GPT en runtime
- ~~Tuning prompt spécifique GPT~~ → style override openai (bloc du 28 août 01:50)

### Validation

- `npm test` — 128 tests verts (dont Claude + orchestrateur)
- `npm run build` — OK
- Test WhatsApp manuel avec `AI_PROVIDER=openai` + clé valide : à faire (flow menu → panier → livraison → confirmation)

##########

## Refactor — AiService + AI_PROVIDER (Claude / GPT)

Date : 28 août 2026, 00:20

### Comportement

- Interface neutre `AiService` (`generateReply({ systemPrompt, messages, tools?, executor? })`)
- Token Nest **`AI_PROVIDER`** : factory lit `ai.provider` (`AI_PROVIDER` dans `.env`) → `ClaudeService` ou `GptService`
- Valeurs : `claude` (défaut), `openai` / `gpt` ; inconnu → fallback Claude + warning
- `GptService` : squelette placeholder à l’origine (remplacé par implémentation OpenAI — voir bloc du 28 août 01:25)
- Claude déplacé sous `src/ai/claude/` ; Vision menu reste Claude-only (injection directe)
- Orchestrateur injecte `@Inject(AI_PROVIDER)` au lieu de `ClaudeService`

### Fichiers

- `src/ai/ai.service.interface.ts`, `ai.constants.ts`, `ai.provider.ts`, `ai.module.ts`
- `src/ai/claude/*`, `src/ai/gpt/*`
- `src/conversation/conversation-orchestrator.service.ts` (+ spec)
- `src/config/configuration.ts`, `.env.example`, `.env`
- Suppression de `src/claude/`

### Non fait (volontaire)

- ~~Implémentation réelle OpenAI / SDK~~ → fait (bloc GptService 28 août 01:25)
- Vision via AI_PROVIDER

##########

## Prompt caching Anthropic (system + tools)

Date : 27 août 2026, 00:55

### Comportement

- Flag `ANTHROPIC_PROMPT_CACHE_ENABLED` (défaut `true` ; `false` explicite pour désactiver)
- Sur chaque `messages.create` bot (hors Vision) :
  - `system` en bloc texte avec `cache_control: { type: 'ephemeral' }`
  - `cache_control` uniquement sur le **dernier** tool de la liste
- `ORDERING_TOOLS` : ordre **figé** (dernier = `get_order_status`) — pas de tri/filtre dynamique, sinon le breakpoint ne matche plus
- `extractMenuFromImages` : **sans** cache (`usePromptCache: false`)
- Log DEBUG usage : `cache_write` / `cache_read` (`cache_creation_input_tokens` / `cache_read_input_tokens`)

### Validation manuelle

```bash
npm run verify:prompt-cache
```

Résultat mesuré (system resto + 10 tools) :

- Appel 1 : `cache_write=4377` `cache_read=0`
- Appel 2 : `cache_write=0` `cache_read=4377`

Seuil Sonnet (~1024 tokens) largement dépassé.

### Fichiers

- `docs/prompt-caching-implementation.md` — plan
- `src/config/configuration.ts` — `anthropic.promptCacheEnabled`
- `.env.example` / `.env` — `ANTHROPIC_PROMPT_CACHE_ENABLED=true`
- `src/claude/claude.service.ts` — helpers + `createMessage` + logs
- `src/claude/claude.service.spec.ts` — cache on/off + Vision exclue
- `src/restaurant-ordering/tools/ordering.tools.ts` — commentaire ordre figé
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts` — assert ordre tools
- `src/scripts/verify-prompt-cache.ts` — script §8.2
- `package.json` — `verify:prompt-cache`
- `docs/avancement.md` — case cochée

### Non fait (volontaire)

- Cache sur l’historique messages
- Split prompt statique module / variable business (partage cache multi-restos)
- Cache sur tool_results / Vision

##########

## Bot — phrases descriptives par famille (mode categories)

Date : 25 août 2026, 16:15

### Comportement

- `get_menu` mode=`categories` renvoie `sample[{name, description}]` + `has_more` (plus un teaser liste à virgules)
- Prompt : une **phrase descriptive** par famille (esprit du contenu), pas une liste de plats ; si `has_more`, laisser sentir qu’il y a d’autres choix
- Interdit : « section », « catégorie », listes `tawouk, kafta…`

### Fichiers

- `src/restaurant-ordering/menu/menu.types.ts` — `MenuCategorySampleItem`, summary
- `src/restaurant-ordering/menu/menu.service.ts` — `toCategorySummary`
- `src/restaurant-ordering/tools/get-menu.tool.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`

##########

## Bot — vouvoiement systématique + ton serveur

Date : 25 août 2026, 15:45

### Comportement

- Vouvoiement **obligatoire** à 100 % (même si le client tutoie)
- Exemples contrastés dans le prompt ; ton chaleureux (pas administratif)
- Interdit « en premier », formulations catalogue

### Fichiers

- `src/restaurant-ordering/restaurant-ordering.module-definition.ts` (+ spec)

##########

## Bot — navigation menu par catégories

Date : 25 août 2026, 15:30

### Comportement

- Demande générique « menu » : `get_menu` sans `category` / sans `full`
- Menu long (seuils env) → `mode=categories` (aperçu, pas toute la carte)
- Avec `category` → `mode=items` ; `full: true` → carte complète (jamais le défaut)
- Petit menu → `mode=full` d’emblée
- Seuils : `MENU_CATEGORY_NAV_MIN_ITEMS` (défaut 10), `MENU_CATEGORY_NAV_MIN_CATEGORIES` (défaut 3)

### Fichiers

- `src/config/configuration.ts` — `menu.categoryNav*`
- `.env.example` — variables documentées
- `src/restaurant-ordering/menu/menu.service.ts` (+ types, specs)
- `src/restaurant-ordering/tools/get-menu.tool.ts`
- `src/restaurant-ordering/tools/restaurant-ordering-tools.service.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`

### Non fait (volontaire)

- Boutons WhatsApp list/buttons
- Seuil par resto en DB

##########

## Fix conversation — messages pendant Claude + prefill

Date : 25 août 2026, 15:15

### Problème

1. Message reçu pendant un job `active` : flag follow-up posé, puis `scheduleProcessing` dans le `finally` voyait encore le job `active` → **aucun job reprogrammé**
2. Session `[A, B, assistant]` → Claude 400 « conversation must end with a user message »

### Correctifs

- `scheduleFollowUpProcessing` avec jobId distinct `…__fu`
- Flag Redis `followup:conversation:…` + `hasUserMessagesSince` (snapshot début de traitement)
- `appendAssistantMessage(..., insertAfterCount)` → `[A, assistant, B]`
- `trimTrailingAssistantMessages` avant appel Claude

### Fichiers

- `src/conversation-queue/conversation-debounce.service.ts` (+ spec)
- `src/conversation-queue/conversation.processor.ts` (+ spec)
- `src/conversation-queue/conversation-queue.constants.ts`
- `src/redis/redis.service.ts` — `markFlag` / `consumeFlag`
- `src/conversation/conversation-session.service.ts`
- `src/conversation/conversation-orchestrator.service.ts`
- `src/conversation/session.types.ts` (+ specs)

##########

## Bot — présentation menu WhatsApp (`price_label`)

Date : 25 août 2026, 14:40

### Comportement

- Chaque plat expose `price_label` formaté (ex. `Sandwich 2 500 F · Plat 7 500 F`)
- Prompt : structure aérée (pas « - nom — prix » collé) ; espace insécable fr-FR normalisé

### Fichiers

- `src/restaurant-ordering/menu/menu.service.ts` — `formatItemPriceLabel` / `formatXof`
- `src/restaurant-ordering/menu/menu.types.ts`
- `src/restaurant-ordering/tools/get-menu.tool.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`

##########

## Menu — variantes multi-prix (Sandwich/Plat, MM/GM…)

Date : 25 août 2026, 14:00

### Comportement

- Options avec `choices[{name, price}]` = **supplément** vs prix de base
- Vision extrait `variants[]` → normalisé en option Format + choices
- Bot / `add_to_cart` : passer le nom de la variante ; dashboard + review éditables

### Fichiers

- `src/restaurant-ordering/menu/menu.types.ts` / `menu.service.ts` — `variantsToOption`, resolve options
- `src/claude/claude.service.ts` — prompt Vision variants
- `src/restaurant-ordering/menu/menu-extraction.service.ts`
- Prompt bot + tools ordering
- UI `wini-food` menu + review

##########

## Phase 5 — Review menu (upload Vision → review → publish)

Date : 25 août 2026, ~03:00–12:00

### Comportement

- Upload **1–5 images** (JPEG/PNG/WebP/GIF, max 8 Mo) → Claude Vision → draft `menu_extractions`
- Écran Angular `/menu/review/:id` : corriger catégories/plats/prix/options → publier
- Publish défaut = **append** ; option **replace** disponible
- Multer `memoryStorage()` requis pour avoir `buffer`
- Jamais de publish sans review humaine

### Fichiers backend

- Migration `1787002900000-AddMenuExtractions.ts` — table `menu_extractions`
- `src/restaurant-ordering/menu/menu-extraction.service.ts` (+ entity, types)
- `src/dashboard-api/menu/dashboard-menu-extractions.controller.ts`
- `src/claude/claude.service.ts` — `extractMenuFromImages`

### Fichiers frontend (`wini-food/`)

- `menu-review.component.*`
- `menu-extraction.models.ts`
- `menu-api.service.ts` — endpoints extractions
- Modal import multi-images + preview sur l’écran Menu

### Non fait (volontaire)

- PDF multi-pages
- OCR hors Claude Vision

##########

## Phase 5 — Écran Zones de livraison (CRUD)

Date : 25 août 2026

### Comportement

- API `GET/POST/PATCH/DELETE /dashboard/zones`
- UI Angular `/zones` : liste + création/édition/suppression (quartier + frais)

### Fichiers

- Backend dashboard zones controller/service
- `wini-food/.../zones/*`

##########

## Phase 5 — Écran Menu CRUD + catégories

Date : 25 août 2026

### Comportement

- API `GET/POST/PATCH /dashboard/menu` (+ availability)
- Catégories `menu_categories` : `GET/POST/DELETE /dashboard/menu/categories`
- UI grille menu : recherche, cartes (nom + prix visibles), options/variantes compactes
- Fix bug prix zone / affichage cartes après gros import

### Fichiers

- `src/dashboard-api/menu/dashboard-menu.controller.ts`
- `src/restaurant-ordering/menu/*` (CRUD dashboard)
- `wini-food/.../menu/*`

##########

## Phase 5 — WebSocket dashboard commandes

Date : 25 août 2026, 02:20

### Comportement

- Namespace Socket.IO `/dashboard`, auth JWT (`handshake.auth.token`)
- Room multi-tenant `business:{businessId}`
- À `confirm_order` → event `order.created` vers le resto concerné
- À `PATCH` statut (dont annulation) → event `order.updated`
- Angular : connexion au login dashboard, push live sur le board (filtre date respecté)

### Fichiers

Backend (`whatsapp-bot/`) :
- `src/dashboard-api/orders/dashboard-orders.gateway.ts`
- `src/restaurant-ordering/orders/dashboard-order.events.ts`
- `src/restaurant-ordering/orders/orders.service.ts` (emit)
- `src/app.module.ts` (`EventEmitterModule`)

Frontend (`wini-food/`) :
- `src/app/core/realtime/dashboard-realtime.service.ts`
- `src/app/features/dashboard/dashboard-shell.component.ts`
- `src/app/features/dashboard/orders/orders.component.ts`

### Non fait (volontaire)

- Notif navigateur / son
- Sync forcée hors filtre date
- Notif WhatsApp client au changement de statut

##########

## Phase 5 — Liste commandes Angular

Date : 25 août 2026, 01:00

### Comportement

- Page `/orders` charge `GET /dashboard/orders` (filtre statut)
- Affiche numéro, date, téléphone, items, mode livraison, total, note
- Bouton d’avancement de statut via `PATCH /dashboard/orders/:id/status`
- Empty / loading / error states

### Fichiers (`wini-food/`)

- `src/app/features/dashboard/orders/orders-api.service.ts`
- `src/app/features/dashboard/orders/orders.models.ts`
- `orders.component.ts|html|css`

### Non fait (volontaire)

- WebSocket push nouvelle commande
- Polling / refresh auto
- Notif WhatsApp au client (Phase 6)

##########

## Phase 5 — Auth Angular (wini-food)

Date : 25 août 2026, 00:55

### Comportement

- Login `/login` → `POST /auth/login` NestJS → stocke JWT + user + business en localStorage
- Interceptor Bearer automatique ; `authGuard` / `guestGuard`
- Après login → `/orders` (dashboard shell + page Commandes vide)
- Header : marque Wini Food, nom du business, email, déconnexion

### Fichiers (`wini-food/`)

- `src/app/core/auth/` — service, interceptor, guards, models
- `src/app/features/login/`
- `src/app/features/dashboard/` — shell + orders (empty state)
- `src/environments/*`, `app.routes.ts`, `app.config.ts`

### Non fait (volontaire)

- Liste réelle des commandes via `GET /dashboard/orders`
- WebSocket
- Tests e2e Angular

##########

## Phase 5 — API dashboard commandes (JWT)

Date : 25 août 2026, 00:48

### Comportement

- `GET /dashboard/orders` — liste les commandes du `businessId` du JWT (`?status=`, `?limit=`)
- `GET /dashboard/orders/:id` — détail (404 si autre business)
- `PATCH /dashboard/orders/:id/status` — `{ "status": "preparing" }` avec transitions strictes : received → preparing → ready → completed
- Historique `order_status_history` mis à jour à chaque changement
- Toutes les routes protégées par `JwtAuthGuard`

### Fichiers

- `src/restaurant-ordering/orders/orders.service.ts` — `listForBusiness`, `findForBusiness`, `updateStatus`
- `src/dashboard-api/orders/dashboard-orders.controller.ts`
- `src/dashboard-api/dashboard-api.module.ts`
- Tests service + controller

### Non fait (volontaire)

- WebSocket push nouvelle commande
- Login / écrans Angular
- Notif WhatsApp au client (Phase 6)

##########

## Phase 5 — Auth JWT dashboard

Date : 25 août 2026, 00:40

### Comportement

- `POST /auth/login` `{ email, password }` → `{ access_token, user, business }` (business résolu via `businesses.user_id`)
- `GET /auth/me` (Bearer JWT) → user + business liés
- JWT payload : `sub` (userId), `businessId`, `email` — revalidé à chaque requête (user ↔ business toujours liés)
- Mot de passe hashé bcrypt ; CORS Angular `http://localhost:4200`
- Seed users : `npm run seed:users` (lie 2 comptes aux 2 businesses)

### Fichiers

- `src/auth/` — module, controller, service, JwtStrategy, JwtAuthGuard, CurrentUser
- `src/businesses/businesses.service.ts` — `findByUserId`
- `src/dashboard-api/dashboard-api.module.ts` — importe AuthModule
- `src/main.ts` — CORS
- `src/config/configuration.ts` — `jwt.*`, `app.corsOrigin`
- `src/database/seeds/seed-test-users.ts`
- `.env.example` — `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`

### Comptes test

- `winiga@test.local` / `password123` → Winiga Jordan
- `delices@test.local` / `password123` → Les délices de Jordan

### Non fait (volontaire)

- API orders / WebSocket / écrans Angular
- Refresh token / logout blacklist
- Register public (création compte)

##########

## Indicateur typing + accusé de lecture WhatsApp

Date : 24 août 2026, 19:15

### Comportement

- Session Redis : `last_whatsapp_message_id` (wamid) mis à jour à chaque `appendUserMessage` depuis le webhook
- Worker `ConversationProcessor` : après verrou, appelle `markAsReadWithTyping` avant Claude
- `WhatsappClientService.markAsReadWithTyping` — POST Meta `status: read` + `typing_indicator`; échec loggé, jamais bloquant

### Fichiers

- `src/whatsapp-client/whatsapp-client.service.ts`
- `src/conversation/session.types.ts`
- `src/conversation/conversation-session.service.ts`
- `src/webhook/webhook.controller.ts`
- `src/conversation-queue/conversation.processor.ts`
- Tests : `whatsapp-client`, `conversation-session`, `conversation.processor`, `webhook.controller`
- `docs/test-manuel-bot.md` — section UX

### Non fait (volontaire)

- Validation manuelle coches bleues + typing sur téléphone

##########

## Stabilisation bot — clear_cart + limite tools

Date : 24 août 2026, 19:00

### Comportement

- Tool `clear_cart` : vide panier + reset `delivery_info` + `order_note` ; `cart_already_empty` si déjà vide
- Prompt resto mis à jour (vider panier vs retirer un item)
- `CLAUDE_TOOL_MAX_ITERATIONS` défaut passé à **8** (`.env`, config, fallback code)
- Fallback déjà en place : dernier appel Claude **sans tools** si limite atteinte
- Checklist tests manuels : `docs/test-manuel-bot.md`
- `avancement.md` : section stabilisation

### Fichiers

- `src/restaurant-ordering/cart/cart.service.ts` — `clearCart`
- `src/restaurant-ordering/tools/ordering.tools.ts` — `CLEAR_CART_TOOL`
- `src/restaurant-ordering/tools/restaurant-ordering-tools.service.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/config/configuration.ts`, `.env.example`, tests cart + tools + module-definition
- `docs/test-manuel-bot.md`, `docs/avancement.md`

### Non fait (volontaire)

- Exécution de la checklist manuelle (à faire côté utilisateur avec ngrok)
- Logs détaillés des tools par tour Claude
- Phase 5 dashboard

##########

## Debounce + queue BullMQ (messages simultanés)

Date : 22 août 2026, 13:12

### Problème

Rafales WhatsApp sur la même conversation → traitements parallèles sur la session Redis (race conditions panier, réponses dupliquées / désordonnées).

### Comportement

- Webhook : `appendUserMessage` immédiat, puis `ConversationDebounceService.scheduleProcessing` — **plus d’appel direct** à l’orchestrateur ni Send API
- Job BullMQ `jobId = {business_id}:{client_phone}`, délai configurable (`CONVERSATION_DEBOUNCE_DELAY_MS`, défaut 2500 ms) — reprogrammation si nouveau message avant expiration (debounce)
- Worker `ConversationProcessor` : verrou Redis `SET NX` → `processConversation` → `sendTextMessage` → reprogrammation si messages user en attente après traitement
- Orchestrateur scindé : `handleIncomingMessage` (append + process, tests/compat) vs `processConversation` (lecture session → Claude → append assistant, sans re-append user)
- `hasPendingUserMessages()` pour détecter les messages reçus pendant le traitement Claude

### Fichiers

- `src/conversation-queue/conversation-queue.module.ts` — BullMQ (`REDIS_URL`), worker, export debounce
- `src/conversation-queue/conversation-debounce.service.ts`
- `src/conversation-queue/conversation.processor.ts`
- `src/conversation-queue/conversation-queue.constants.ts`
- `src/conversation-queue/conversation-job.types.ts`
- `src/conversation/conversation-orchestrator.service.ts` — `processConversation`
- `src/conversation/session.types.ts` — `hasPendingUserMessages`
- `src/redis/redis.service.ts` — `tryAcquireLock` / `releaseLock`
- `src/businesses/businesses.service.ts` — `findById`
- `src/webhook/webhook.controller.ts` — debounce au lieu d’orchestrateur direct
- `src/config/configuration.ts` — `conversation.debounceDelayMs`
- `.env.example` — `CONVERSATION_DEBOUNCE_DELAY_MS`
- Tests : `conversation-debounce.service.spec.ts`, `conversation.processor.spec.ts`, `webhook.controller.spec.ts`, `session.types.spec.ts`, `conversation-orchestrator.service.spec.ts`
- Packages : `bullmq`, `@nestjs/bullmq`

### Non fait (volontaire)

- Validation manuelle bout-en-bout des 3 scénarios doc (`whatsapp-bot-debounce-queue.md` §7) — à faire avec ngrok + vrais messages
- Persist Postgres `conversations` / `messages` — inchangé (reporté)

##########

## Frais de livraison par zone

Date : 22 août 2026, 12:50

### Comportement

- `delivery_zones.delivery_fee` — frais par quartier (FCFA)
- `set_delivery_info` en livraison : enregistre `delivery_fee` en session + le retourne au tool
- `get_cart_summary` : `subtotal`, `delivery_fee`, `total`
- `get_delivery_zones` : liste `{ name, delivery_fee }`
- `confirm_order` : revalide le frais depuis la zone en base ; `orders.delivery_fee` + `total` = subtotal + frais
- Retrait : `delivery_fee = 0`
- Seed zones mis à jour (`npm run seed:zones`)

### Fichiers

- Migration `1787002700000-AddDeliveryFee.ts`
- `delivery-zones` entity + service
- `cart.service.ts`, `orders.service.ts`, tools, prompt
- `seed-delivery-zones.ts`

##########

## Fix add_to_cart — UUID invalide (thieb-yapp-id)

Date : 22 août 2026, 12:45

### Problème

Claude appelait `add_to_cart` avec un id inventé (`thieb-yapp-id`) → Postgres `invalid input syntax for type uuid` → orchestrateur en échec, pas de réponse client.

### Comportement

- `isUuid()` avant toute requête `menu_items` par id
- Id invalide → `{ success: false, reason: 'item_not_found' }` (pas d’exception)
- Prompt + description tool `add_to_cart` : utiliser l’UUID exact de `get_menu`

### Fichiers

- `src/common/uuid.util.ts`
- `src/restaurant-ordering/menu/menu.service.ts`
- `src/restaurant-ordering/tools/ordering.tools.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`

##########

## Note de commande — optionnelle, non bloquante

Date : 22 août 2026, 12:32

### Comportement

- `note_declined` supprimé ; plus de `note_not_addressed` sur `confirm_order`
- `set_order_note` : enregistre une note seulement si le client en fournit une
- Récap : mention optionnelle de la note dans le même message (« vous pouvez ajouter une note si besoin, sinon je valide comme ça »)
- Confirmation possible sans note ni réponse explicite sur la note

### Fichiers

- `src/conversation/session.types.ts`
- `src/restaurant-ordering/cart/cart.service.ts`
- `src/restaurant-ordering/orders/orders.service.ts`
- `src/restaurant-ordering/tools/ordering.tools.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`

##########

## Note de commande (set_order_note)

Date : 22 août 2026, 12:25

### Comportement

- Session Redis : `order_note` + `note_declined`
- Tool `set_order_note` : enregistre une note ou `declined=true` si le client n’en veut pas
- `get_cart_summary` expose l’état de la note
- Au récap : si pas de note et pas declined → le bot demande ; `confirm_order` refuse avec `note_not_addressed` tant que non traité
- Colonne `orders.note` (migration `1787002600000`)

### Fichiers

- `src/conversation/session.types.ts`
- `src/restaurant-ordering/cart/cart.service.ts`
- `src/restaurant-ordering/tools/ordering.tools.ts`
- `src/restaurant-ordering/tools/restaurant-ordering-tools.service.ts`
- `src/restaurant-ordering/orders/orders.service.ts` + entity
- `src/database/migrations/1787002600000-AddOrderNote.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`

##########

## Phase 4 — Panier, livraison, confirmation commande

Date : 22 août 2026, 12:18

### Comportement

- **Panier Redis** : `CartService` via `ConversationSessionService.mutateSession`
- **Tools** : `add_to_cart`, `remove_from_cart`, `get_cart_summary`, `get_delivery_zones`, `set_delivery_info`, `confirm_order`, `get_order_status` (+ `get_menu`)
- **Livraison** : matching quartier côté backend (`zone-matching.util`), pas de GPS
- **confirm_order** : revalidation prix/dispo en base → création `orders` + `order_status_history` → vide panier Redis
- **Prompt** : flow commande specs §8 (récap → confirmation explicite)
- **Seed zones** : `npm run seed:zones`

### Fichiers

- `src/restaurant-ordering/cart/cart.service.ts`
- `src/restaurant-ordering/delivery-zones/delivery-zones.service.ts` + `zone-matching.util.ts`
- `src/restaurant-ordering/orders/orders.service.ts`
- `src/restaurant-ordering/tools/ordering.tools.ts`
- `src/restaurant-ordering/tools/restaurant-ordering-tools.service.ts`
- `src/conversation/conversation-session.service.ts` — `mutateSession`
- `src/database/seeds/seed-delivery-zones.ts`

### Non fait (volontaire)

- WebSocket dashboard à la confirmation (Phase 5)
- Notifications WhatsApp statut commande (Phase 6)

##########

## Phase 3 — Menu + tool get_menu

Date : 22 août 2026, 12:02

### Comportement

- `MenuService.getMenu(businessId, category?)` — lit `menu_items`, groupe par catégorie, format specs §9
- Tool `get_menu` exposé via `restaurant-ordering` → exécuté par `RestaurantOrderingToolsService`
- `ModuleToolRegistryService` délègue les tools au module métier
- `ClaudeService.generateReply` — boucle tool calling (max 5 itérations) si tools + executor fournis
- Orchestrateur passe tools + executor au registre
- Prompt resto : menu via `get_menu`, commande encore reportée (Phase 4)
- Seed : `npm run seed:menu` — plats pour Winiga Jordan et Les délices de Jordan

### Fichiers

- `src/restaurant-ordering/menu/menu.service.ts` (+ types, spec)
- `src/restaurant-ordering/tools/get-menu.tool.ts`
- `src/restaurant-ordering/tools/restaurant-ordering-tools.service.ts` (+ spec)
- `src/module-registry/module-tool-registry.service.ts` (+ spec)
- `src/claude/claude.service.ts` — boucle tools
- `src/conversation/conversation-orchestrator.service.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/database/seeds/seed-test-menu.ts`
- `package.json` — script `seed:menu`

### Non fait (volontaire) — à la date du bloc (22 août)

- ~~Upload Vision + review dashboard~~ → **fait** le 25 août (voir bloc « Phase 5 — Review menu »)
- ~~Endpoints HTTP CRUD menu~~ → **fait** le 25 août (voir bloc « Phase 5 — Écran Menu CRUD »)
- Tools panier → **fait** Phase 4

##########

## Décision — persist Postgres reporté

Date : 22 août 2026, 11:53

### Décision

Ne **pas** implémenter pour l’instant la persistance async `conversations` / `messages` en Postgres. Redis reste la seule source pour l’historique conversationnel en runtime.

### Pourquoi

- Non bloquant pour faire avancer le bot (menu, panier, commande)
- Valeur surtout au dashboard (Phase 5) et en pilote restos réels
- Tables déjà en schéma, prêtes quand on reprendra

### Reprendre quand

Avant Phase 5 (dashboard) ou pilote avec de vrais commerces.

### Fichiers doc mis à jour

- `docs/avancement.md`
- `docs/etat-actuel.md`

### Non fait (volontaire)

- `ConversationPersistenceService` ou équivalent
- Écriture async user/assistant en base

##########

## Premier message : présentation assistant virtuel

Date : 22 août 2026, 11:30

### Comportement

- Dans le system prompt `restaurant_ordering`, consigne explicite pour la **première réponse** : Claude doit se présenter brièvement comme l'assistant virtuel du restaurant, puis répondre au client.
- L'identité de base du prompt dit désormais « assistant virtuel WhatsApp ».

### Fichiers

- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts`

### Non fait

- Détection côté orchestrateur (le prompt s'appuie sur l'historique : aucun message assistant = premier message)
- Persist Postgres

##########

## Fenêtre glissante Claude (20 messages)

Date : 18 août 2026, 04:28

### Objectif

Specs §6 : n’envoyer à Claude que les N derniers échanges, pas tout Redis.

### Comportement

- `CLAUDE_MESSAGE_WINDOW = 20`
- `sliceMessagesForClaude` : `messages.slice(-20)`, puis on drop les `assistant` en tête (Claude veut commencer par `user`)
- Redis **garde** tout le TTL ; seule l’entrée `generateReply` est tronquée
- Log : `messages={fenêtre}/{total session}`

### Fichiers

- `src/conversation/session.types.ts` — constante + `sliceMessagesForClaude`
- `src/conversation/session.types.spec.ts`
- `src/conversation/conversation-orchestrator.service.ts`
- `src/conversation/conversation-orchestrator.service.spec.ts`

### Non fait

- Persist Postgres
- Tronquer Redis lui-même

##########

## Ton WhatsApp — entre-deux (serveur sympa)

Date : 18 août 2026, 04:21

### Objectif

Recalibrer le prompt après le réglage trop froid : chaleureux, sans commercial.

### Comportement

- Ton « serveur WhatsApp sympa », pas robot ni marketing
- Emoji occasionnel OK, jamais systématique
- Pas de markdown
- Formulations variées, un peu d’empathie, pas « Bonne question ! »
- Redirection contact : expliquer pourquoi + excuse légère, pas juste le numéro

### Fichiers

- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts`

##########

## Ton WhatsApp — prompt resto (anti chatbot marketing)

Date : 18 août 2026, 04:17

### Objectif

Corriger le system prompt resto : réponses comme une personne sur WhatsApp, pas un bot marketing.

### Comportement

`buildSystemPrompt` impose maintenant :
- pas d’emoji (sauf si le client en met, max 1)
- pas de markdown / gras
- pas d’ouverture creuse (« Bonne question ! », etc.)
- phrases courtes, peu ou pas de `!`
- info manquante : le dire brièvement, orienter vers `contactPhone` s’il existe

Le texte « cette fonctionnalité arrive bientôt » a été retiré (trop commercial).

### Fichiers

- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts`

### Non fait

- Pas d’autre changement (orchestrateur, Claude, webhook)

##########

## Orchestrateur conversation (remplace l’ack)

Date : 18 août 2026, 04:04

### Objectif

update2 : après lookup business, `handleIncomingMessage` orchestre session → registre → Claude → Send API. Plus d’ack `Message reçu — {name}`.

### Comportement

- `ConversationOrchestratorService.handleIncomingMessage(business, from, text)`
  1. `appendUserMessage`
  2. `getSession`
  3. `moduleRegistry.resolve(business.module.key)`
  4. `buildSystemPrompt(business)`
  5. `claude.generateReply(systemPrompt, session.messages)` (pas de tools)
  6. `appendAssistantMessage` si réponse non vide
- Webhook envoie le texte Claude via Send API
- Erreur orchestrateur → log, Meta reçoit quand même `200`

### Fichiers

- `src/conversation/conversation-session.service.ts` — `getSession`, `appendAssistantMessage`
- `src/conversation/conversation-orchestrator.service.ts`
- `src/conversation/conversation-orchestrator.service.spec.ts`
- `src/conversation/conversation.module.ts` — importe `ClaudeModule`, exporte l’orchestrateur
- `src/webhook/webhook.controller.ts` — plus d’ack fixe
- `src/webhook/webhook.controller.spec.ts`

### Non fait (volontaire)

- Fenêtre glissante
- Persist Postgres `conversations` / `messages`
- Tools resto

##########

## ModuleRegistryService.resolve

Date : 18 août 2026, 04:01

### Objectif

update2 : résoudre `modules.key` → `ModuleDefinition` sans que `conversation/` ou `claude/` importent le resto.

### Comportement

- `resolve('restaurant_ordering')` → `restaurantOrderingModuleDefinition`
- key inconnu → `Error('Module inconnu: …')`
- Carte `MODULE_REGISTRY` inchangée (une entrée pour l’instant)

### Fichiers

- `src/module-registry/module-registry.constants.ts` — `MODULE_REGISTRY_TOKEN`
- `src/module-registry/module-registry.service.ts`
- `src/module-registry/module-registry.service.spec.ts` — 2 tests
- `src/module-registry/module-registry.module.ts` — fournit et exporte le service

### Non fait (volontaire)

- Orchestrateur conversation
- Remplacement de l’ack WhatsApp
- Deuxième module métier

##########

## Prompt resto Phase 2 (`buildSystemPrompt`)

Date : 18 août 2026, 03:59

### Objectif

update2 : le system prompt métier vit dans `restaurant-ordering/`, pas dans `claude/`.

### Comportement

`restaurantOrderingModuleDefinition.buildSystemPrompt(business)` produit un prompt qui :
- se présente comme l’assistant WhatsApp de `{business.name}`
- injecte adresse / contact s’ils existent
- ton chaleureux, court, FR (s’adapter au wolof)
- **pas encore** de menu ni de commande → dire poliment que ça arrive bientôt
- `getTools()` reste `[]`

### Fichiers

- `src/restaurant-ordering/restaurant-ordering.module-definition.ts`
- `src/restaurant-ordering/restaurant-ordering.module-definition.spec.ts` — 3 tests

### Non fait (volontaire)

- `ModuleRegistryService.resolve`
- Orchestrateur / remplacement de l’ack WhatsApp
- Tools (Phase 4)

##########

## ClaudeService générique (`generateReply`)

Date : 18 août 2026, 03:54

### Objectif

Phase 2 update2 : client Anthropic réutilisable, sans aucun texte métier resto.

### Comportement

- Config : `anthropic.apiKey` (`ANTHROPIC_API_KEY`), `anthropic.model` (défaut `claude-sonnet-5`)
- `ClaudeService.generateReply(systemPrompt, messages, tools?)` → `messages.create`
- `tools` omis si absent ou vide
- Réponse = concaténation des blocs `type === 'text'`
- Clé absente → throw `ANTHROPIC_API_KEY manquante`
- **Pas branché** au webhook : l’ack `Message reçu — {name}` reste en place

### Fichiers

- `src/config/configuration.ts` — bloc `anthropic`
- `.env.example` — `ANTHROPIC_API_KEY=`
- `src/claude/claude.service.ts`
- `src/claude/claude.service.spec.ts` — 2 tests (mock SDK)
- `src/claude/claude.module.ts` — exporte `ClaudeService`
- `package.json` — `@anthropic-ai/sdk` (`--legacy-peer-deps`)

### Non fait (volontaire)

- Prompt resto Phase 2
- `ModuleRegistryService`
- Orchestrateur / remplacement de l’ack
- `appendAssistantMessage`

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