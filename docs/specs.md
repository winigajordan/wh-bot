# Bot WhatsApp Resto — Specs Techniques (MVP/POC)

> Amendé par [update1.md](./update1.md) : `restaurants` → `businesses`, `restaurant_id` → `business_id`. Module métier actuel : `restaurant_ordering`. L’auth login est reportée.

> Document de contexte projet à fournir à un agent de codage (Cursor) pour générer/développer le projet de façon cohérente avec l'architecture définie.

## 1. Vue d'ensemble

Bot de commande automatisée pour restaurants via WhatsApp Business API. Le client interagit en langage naturel avec un assistant conversationnel (Claude) qui gère la consultation du menu, la construction du panier, et la confirmation de commande. Les restaurateurs gèrent leurs commandes via un dashboard web dédié.

**Scope POC/MVP** : vertical restaurants uniquement. Extension future prévue (finance, écoles) mais hors scope actuel — ne pas généraliser prématurément le code pour ça.

**Modèle métier** : paiement à la livraison/sur place uniquement pour le MVP (pas de paiement en ligne). Livraison avec vérification de zone (liste de quartiers) OU retrait sur place.

## 2. Stack technique

- **Backend** : NestJS (TypeScript)
- **Base de données** : PostgreSQL (via TypeORM)
- **Cache/sessions** : Redis
- **Dashboard frontend** : Angular
- **Temps réel dashboard** : WebSocket (NestJS Gateway)
- **IA conversationnelle** : Claude API (Anthropic), modèle `claude-sonnet-4-6`, function calling
- **Messagerie** : Meta WhatsApp Cloud API (webhook + Send API)

## 3. Architecture générale

```
Client WhatsApp
   ↓ message
Meta WhatsApp Cloud API
   ↓ webhook (POST /webhooks/whatsapp)
NestJS — Module Webhook
   ↓ résolution restaurant (phone_number_id → restaurant_id)
   ↓ résolution session (Redis: restaurant_id + client_phone)
NestJS — Module Conversation
   ↓ appel Claude API (system prompt + historique + tools)
Claude (function calling)
   ↓ tool_use blocks
NestJS — exécution des tools (lecture/écriture Postgres + Redis)
   ↓ résultats renvoyés à Claude
Claude — réponse finale en langage naturel
   ↓
NestJS — WhatsApp Send API → client
   ↓ (si commande confirmée)
NestJS — WebSocket → Dashboard resto (notif temps réel)
```

**Principe clé de routing multi-tenant** : un seul WABA, plusieurs numéros (un par resto), un seul webhook. Le `phone_number_id` présent dans chaque payload webhook est la clé qui identifie le restaurant concerné — pas l'URL du webhook (Meta n'autorise qu'une URL de webhook par WABA).

## 4. Structure des modules NestJS

```
src/
  webhook/          → réception webhook Meta, vérification signature HMAC, routing multi-tenant
  conversation/      → gestion session (Redis), historique, orchestration appel Claude
  claude/            → client Anthropic SDK, system prompt builder, définition des tools
  restaurants/       → CRUD restaurants, gestion phone_number_id, zones de livraison
  menu/              → CRUD menu, upload + extraction Claude vision, écran de review
  orders/            → création/gestion commandes, statuts, revalidation
  dashboard-api/     → endpoints consommés par le frontend Angular (auth, commandes, menu, zones)
  whatsapp-client/   → wrapper autour de l'API Send WhatsApp (envoi messages)
```

## 5. Schema base de données (PostgreSQL)

```sql
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  address TEXT,
  contact_phone VARCHAR,
  whatsapp_phone_number_id VARCHAR UNIQUE NOT NULL,
  whatsapp_waba_id VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active', -- active | inactive
  opening_hours JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id),
  category VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT,
  available BOOLEAN DEFAULT true,
  options JSONB DEFAULT '[]', -- variantes/suppléments
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id),
  zone_name VARCHAR NOT NULL -- ex: "Fass", "Point E", "Médina"
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id),
  client_phone VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active', -- active | closed
  last_message_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role VARCHAR NOT NULL, -- user | assistant
  content TEXT,
  tool_calls JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id),
  client_phone VARCHAR NOT NULL,
  order_number VARCHAR UNIQUE NOT NULL,
  items JSONB NOT NULL, -- snapshot des items commandés (nom, prix, qty, options)
  delivery_mode VARCHAR NOT NULL, -- delivery | pickup
  delivery_address TEXT,
  delivery_zone_id UUID REFERENCES delivery_zones(id),
  total NUMERIC NOT NULL,
  status VARCHAR DEFAULT 'received', -- received | preparing | ready | completed
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  status VARCHAR NOT NULL,
  changed_at TIMESTAMP DEFAULT now()
);
```

## 6. Sessions (Redis)

**Clé** : `session:{restaurant_id}:{client_phone}`
**TTL** : 30 minutes d'inactivité (pas de relance automatique sur panier abandonné pour le MVP)

**Structure de la valeur (JSON)** :
```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "cart": [
    { "item_id": "...", "name": "...", "price": 0, "quantity": 1, "options": [] }
  ],
  "delivery_info": { "mode": "delivery|pickup", "address_text": "...", "zone_id": "..." },
  "last_activity": "ISO timestamp"
}
```

L'historique renvoyé à Claude à chaque appel = fenêtre glissante des N derniers échanges (pas tout l'historique complet, pour maîtriser le coût en tokens). Chaque message est aussi persisté en Postgres (table `messages`) de façon asynchrone pour l'historique complet et le debug.

## 7. Webhook (Module Webhook)

### `GET /webhooks/whatsapp`
Challenge de vérification Meta (retourne `hub.challenge` si `hub.verify_token` correspond).

### `POST /webhooks/whatsapp`
1. Vérifier la signature `X-Hub-Signature-256` (HMAC SHA256 avec l'App Secret) — rejeter si invalide
2. Extraire `phone_number_id` du payload → résoudre `restaurant_id`
3. Extraire `from` (numéro client) et le contenu du message
4. Charger ou créer la session Redis correspondante
5. Transmettre au module Conversation pour traitement

## 8. System prompt (Claude)

Reconstruit dynamiquement à chaque appel, avec injection des données du restaurant. Structure :

```
1. Rôle et contexte resto (nom, adresse, horaires)
2. Règles métier non négociables :
   - Ne jamais confirmer une commande sans récapitulatif validé explicitement
   - Ne jamais inventer un plat, un prix, ou une disponibilité — toujours 
     utiliser les tools pour vérifier
   - Un item ne peut être ajouté qu'après vérification via les tools
   - Le prix total doit toujours provenir des données réelles
3. Ton et style : chaleureux, direct, efficace, réponses courtes adaptées 
   à WhatsApp, français par défaut (s'adapter si le client écrit en wolof 
   ou autre langue)
4. Gestion du hors-scope : si demande hors du champ menu/commande, rediriger 
   poliment vers le contact direct du restaurant, ne jamais deviner
5. Flow de commande attendu :
   a. Comprendre l'intention (consultation ou commande)
   b. Construire le panier via add_to_cart
   c. Avant finalisation : demander livraison ou retrait
      - Si livraison : demander l'adresse/quartier, valider via 
        set_delivery_info, ne jamais se fier à sa propre estimation 
        de correspondance de zone
      - Si zone non couverte : informer clairement, proposer le retrait 
        comme alternative
   d. Présenter un récapitulatif complet (items, mode, zone/adresse, total)
   e. Attendre confirmation explicite avant confirm_order
   f. Si confirm_order échoue (item indisponible ou prix changé) : ne 
      jamais réessayer automatiquement, présenter le panier mis à jour 
      et redemander confirmation
6. Ne jamais mentionner les noms des tools ou la logique interne au client
```

**Note importante** : pas de personnalisation de ton par restaurant pour le MVP (prévu en V2) — un seul comportement uniforme pour tous les restos.

## 9. Tools Claude (function calling)

### `get_menu`
- Input : `{ category?: string }`
- Output : `{ categories: [{ name, items: [{ id, name, price, description, available, options }] }] }`

### `add_to_cart`
- Input : `{ item_id: string, quantity: number, options?: string[] }` (item_id et quantity requis)
- Output succès : `{ success: true, cart: [...] }`
- Output échec : `{ success: false, reason: "item_unavailable" | "item_not_found" }`

### `remove_from_cart`
- Input : `{ item_id: string }`

### `get_cart_summary`
- Pas d'input
- Output : `{ items: [...], subtotal: number, item_count: number }`

### `get_delivery_zones`
- Pas d'input
- Output : `{ zones: string[] }`

### `set_delivery_info`
- Input : `{ mode: "delivery" | "pickup", address_text?: string }` (address_text requis si mode=delivery)
- Output : `{ valid: true, matched_zone: string }` ou `{ valid: false, available_zones: string[] }`
- Le matching zone se fait côté backend (normalisation + comparaison), jamais laissé au jugement du modèle seul

### `confirm_order`
- Input : `{ confirmed_by_client: boolean }` (doit être `true`, appelé uniquement après confirmation explicite du client)
- **Logique de revalidation stricte avant création** :
  1. Recharger le panier depuis Redis
  2. Pour chaque item : re-vérifier `available = true` ET que le prix correspond à celui actuel en base
  3. Si tout valide → créer la commande (table `orders`), vider le panier Redis, retourner `order_number`
  4. Si invalide → NE PAS créer la commande, retourner `{ success: false, reason: "items_changed", invalid_items: [...] }`
- Échoue aussi si le panier est vide ou si `delivery_info` n'a pas été validé

### `get_order_status`
- Input : `{ order_number: string }`
- Output : statut actuel + historique

## 10. Extraction de menu (Claude Vision — hors function calling)

Flow séparé du mode conversationnel, déclenché uniquement à l'upload depuis le dashboard (pas de tools, appel one-shot) :

1. Upload image/PDF du menu (dashboard)
2. Appel Claude avec contenu image en base64, system prompt demandant un JSON structuré strict (catégories → items → nom/prix/description), sans texte avant/après
3. Parsing du JSON retourné
4. **Écran de review/correction obligatoire** côté dashboard avant toute publication — ne jamais publier une extraction sans validation humaine
5. Sauvegarde en base (`menu_items`) une fois validé
6. Le menu conversationnel (`get_menu`) sert toujours la version validée en base, jamais l'image brute

## 11. Notifications de statut

Chaque changement de statut dans `order_status_history` déclenche un envoi WhatsApp au client via l'API Send. Repose sur la fenêtre de 24h (client-initiated) — pas de template pré-approuvé prévu pour le MVP (à ajouter en V2 si besoin de notifs hors fenêtre).

## 12. Dashboard resto (Angular)

**Modèle d'accès** : 1 compte = 1 restaurant strictement (pas de multi-resto par compte pour le MVP).

**Écrans Must have** :
1. **Commandes** — liste temps réel (WebSocket), triée par statut, changement de statut en un clic, déclenche notif WhatsApp automatique
2. **Menu** — vue éditable de la dernière extraction validée, toggle disponibilité rapide, upload nouveau menu (relance extraction), ajout/suppression manuelle d'item
3. **Zones de livraison** — CRUD simple liste de quartiers (texte), pas de carte GPS pour le MVP

## 13. Hors scope MVP (Won't have — ne pas développer maintenant)

- Paiement en ligne (Wave/Orange Money) — prévu V2
- Gestion logistique livreurs (assignation, tracking chauffeur)
- Programme de fidélité
- Analytics avancées côté resto
- Fallback humain / escalade (juste un message de sortie propre en cas de hors-scope)
- Embedded Signup (onboarding self-service des restos) — ajout manuel des numéros pour le MVP
- Personnalisation du ton par restaurant
- Templates WhatsApp pour notifs hors fenêtre 24h
- Relance automatique sur panier abandonné

## 14. Ordre de développement recommandé

1. **Phase 0** — Setup projet NestJS, schema Postgres + migrations, setup Redis, config env
2. **Phase 1** — Webhook (vérification + réception) + routing multi-tenant + sessions Redis
3. **Phase 2** — Intégration Claude de base (sans tools) : pipeline complet webhook → Claude → réponse → WhatsApp
4. **Phase 3** — Menu : upload, extraction vision, écran review, tool `get_menu`
5. **Phase 4** — Panier et commande : tous les tools restants, revalidation stricte
6. **Phase 5** — Dashboard resto (auth, 3 écrans)
7. **Phase 6** — Notifications de statut
8. **Phase 7** — Durcissement (gestion erreurs Claude, logs, vérifs Meta)
9. **Phase 8** — Pilote avec 2-3 restaurants réels

Les phases 0→1→2 sont séquentielles et bloquantes. La phase 3 peut avancer en parallèle de la phase 4. La phase 5 peut démarrer dès que des endpoints stables existent depuis 3-4.