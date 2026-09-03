# Plan d’implémentation — Chiffrement au repos (conversations / messages)

Document de conception **avant code**. Décrit comment chiffrer en base le contenu des messages et les numéros client, sans changer le flux bot Redis → WhatsApp ni le dashboard Angular.

Dernière rédaction : 3 septembre 2026.

---

## 1. Contexte

Depuis le persist V1, Postgres archive :

- `conversations.client_phone` — numéro WhatsApp du client (**en clair**)
- `messages.content` — texte user / assistant (**en clair**)

Redis reste live (TTL 30 min) : **hors scope** de ce doc (acceptable pour le MVP).

Menaces ciblées :

| Menace | Couverture |
|--------|------------|
| Dump SQL / backup Postgres lisible | Oui (chiffrement applicatif) |
| Accès DB brut (`SELECT *`) | Oui |
| Interception HTTP dashboard ↔ API | **Non** → HTTPS en prod (infra, pas ce doc) |
| Process Nest compromis + clé `.env` | Non (limite normale du chiffrement côté serveur) |

---

## 2. Objectif

Chiffrer **au repos** dans Nest, avant écriture Postgres :

1. Contenu des messages (`content`)
2. Numéro client (`client_phone`)

Le front Angular **ne change pas** : l’API déchiffre et renvoie du JSON lisible (comme aujourd’hui), une fois un endpoint conversations existant.

---

## 3. Hors scope (volontaire)

- Chiffrement Redis / sessions
- E2E payload (déchiffrement dans le navigateur)
- KMS / Vault (clé reste en env pour le MVP ; migration KMS possible plus tard)
- Chiffrement des autres tables (`orders.client_phone`, etc.) — **phase 2** éventuelle
- Rotation de clé automatique (documenter le format pour la permettre plus tard)
- Réécriture / migration des lignes déjà en clair (script one-shot optionnel)

---

## 4. Principe crypto

### Algorithme

- **AES-256-GCM** (Node `crypto`)
- IV aléatoire 12 bytes par chiffrement
- Auth tag 16 bytes (intégrité)

### Format stocké (texte / bytea)

Payload encodé **base64** d’un buffer concaténé :

```text
version (1 byte) | iv (12) | ciphertext | authTag (16)
```

- `version = 0x01` pour le format actuel (facilite une future rotation)

Alternative acceptable : JSON `{ v, iv, ct, tag }` en base64 — plus verbeux, plus lisible en debug.

**Choix retenu :** buffer binaire versionné + base64 dans des colonnes `text` (simple à migrer, pas de bytea obligatoire).

### Clés (env)

| Variable | Rôle |
|----------|------|
| `MESSAGE_ENCRYPTION_KEY` | 32 bytes en **base64** (AES-256) |
| `PHONE_HASH_SECRET` | secret HMAC pour lookup téléphone (ou dérivé de la master key via HKDF) |

**Reco MVP :** une seule master key `MESSAGE_ENCRYPTION_KEY` ; dériver avec HKDF :

- `aes-key` → chiffrement content + phone
- `phone-hmac-key` → hash lookup

Ainsi un seul secret à déployer.

Génération locale :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Refuser de démarrer (ou de persister) si la clé est absente / mauvaise longueur **en production**. En `NODE_ENV=development`, log warning + refus d’écrire en clair (fail closed sur la persist archive).

---

## 5. Modèle de données

### Conversation = 1 business + 1 client

Inchangé : clé logique `(business_id, client_phone_hash)` pour une conversation `active`.

### Schéma cible

**`conversations`**

| Colonne | Type | Notes |
|---------|------|--------|
| `client_phone` | — | **Supprimée** (ou deprecated puis drop) |
| `client_phone_hash` | `varchar` NOT NULL | HMAC-SHA256 hex/base64, pour `findOrCreate` |
| `client_phone_encrypted` | `text` NOT NULL | AES-GCM du numéro E.164 |

Index unique partiel actuel à adapter :

```sql
-- Remplacer UQ_conversations_business_phone_active
CREATE UNIQUE INDEX "UQ_conversations_business_phone_hash_active"
  ON "conversations" ("business_id", "client_phone_hash")
  WHERE "status" = 'active';
```

**`messages`**

| Colonne | Type | Notes |
|---------|------|--------|
| `content` | — | **Supprimée** |
| `content_encrypted` | `text` NULL | AES-GCM ; null si message vide |

`role`, `tool_calls`, `created_at` restent en clair (métadonnées non sensibles / utiles au debug).

### Entités TypeORM

Mettre à jour :

- [`conversation.entity.ts`](../src/conversation/entities/conversation.entity.ts)
- [`message.entity.ts`](../src/conversation/entities/message.entity.ts)

---

## 6. Couches code

### 6.1 `FieldEncryptionService` (nouveau)

Emplacement proposé : `src/crypto/field-encryption.service.ts` (+ module `CryptoModule` global ou importé par `ConversationModule`).

Responsabilités :

```typescript
encrypt(plaintext: string): string;      // → base64 payload v1
decrypt(payload: string): string;        // → plaintext
hashPhone(phone: string): string;        // → HMAC-SHA256 hex
```

- Pas de log du plaintext
- Erreur de déchiffrement explicite (tag invalide / clé fausse)

### 6.2 `ConversationPersistenceService` (existant)

Aujourd’hui ([`conversation-persistence.service.ts`](../src/conversation/conversation-persistence.service.ts)) :

1. `ensureActiveConversation(businessId, clientPhone)` via `client_phone` clair
2. `messages.save({ content })` clair

**Cible :**

1. `phoneHash = hashPhone(clientPhone)`
2. Lookup / create sur `(businessId, phoneHash)` ; stocker `client_phone_encrypted = encrypt(clientPhone)`
3. `content_encrypted = encrypt(content)` (si content non vide)
4. Toujours fire-and-forget + try/catch (ne pas bloquer WhatsApp)

### 6.3 Lecture future (dashboard)

Quand un endpoint `GET /dashboard/conversations` existera :

1. Filtrer par `business_id` du JWT
2. `decrypt(content_encrypted)` / `decrypt(client_phone_encrypted)` **dans le service Nest**
3. Réponse JSON en clair vers Angular
4. Transport protégé par **HTTPS** en prod

Aucun changement Angular pour le chiffrement au repos.

---

## 7. Flux (après implémentation)

```text
WhatsApp
  → Webhook (clair en mémoire)
  → Redis append (clair, TTL)          ← inchangé
  → Persist async :
       hash(phone) + encrypt(phone) + encrypt(content)
       → Postgres
  → Orchestrateur / IA / Send API      ← inchangé
```

```text
Dashboard (futur)
  → GET /dashboard/... (HTTPS)
  → Nest lit ciphertext → decrypt → JSON clair
  → Angular affiche
```

---

## 8. Migration TypeORM

Fichier proposé : `src/database/migrations/XXXXXXXX-EncryptConversationFields.ts`

Étapes `up` :

1. Ajouter `client_phone_hash`, `client_phone_encrypted` (nullable le temps de backfill)
2. Ajouter `content_encrypted` (nullable)
3. **Backfill** (si des lignes existent) : script Nest one-shot **ou** migration SQL impossible sans la clé → **recommandation** : migration structurelle only + script `npm run encrypt:backfill` qui lit clair → écrit chiffré → puis migration drop colonnes
4. Drop index `UQ_conversations_business_phone_active`
5. Créer `UQ_conversations_business_phone_hash_active`
6. Drop `client_phone`, `content` une fois backfill OK

Pour un environnement **vide / peu de data de test** : migration destructive directe (drop clair + add encrypted) acceptable si on accepte de perdre l’archive de test.

**Choix MVP retenu si DB de test seulement :**

- Migration qui drop `content` / `client_phone` et ajoute les colonnes chiffrées
- Pas de backfill (réarchive au prochain message WhatsApp)

Documenter clairement dans la migration : *données d’archive existantes perdues*.

---

## 9. Config

[`configuration.ts`](../src/config/configuration.ts) — ajouter section :

```typescript
encryption: {
  messageKeyBase64: process.env.MESSAGE_ENCRYPTION_KEY,
},
```

`.env.example` :

```bash
# 32 bytes base64 — openssl/node randomBytes(32)
MESSAGE_ENCRYPTION_KEY=
```

Ne **jamais** committer la clé. Ne pas la mettre dans `done.md` / logs.

---

## 10. Tests

| Test | Attendu |
|------|---------|
| `encrypt` puis `decrypt` round-trip | plaintext identique |
| Tamper ciphertext / mauvaise clé | throw |
| `hashPhone` stable | même input → même hash |
| Persist | `save` appelé avec `content_encrypted` / pas de clair |
| Persist sans clé | pas d’écriture clair ; erreur loguée |
| Session Redis | specs inchangées (toujours clair en Redis) |

---

## 11. Checklist d’implémentation

1. [x] `CryptoModule` + `FieldEncryptionService` + tests
2. [x] Config `MESSAGE_ENCRYPTION_KEY` + validation longueur 32 bytes
3. [x] Migration schéma conversations / messages
4. [x] Adapter entités + `ConversationPersistenceService`
5. [x] Mettre à jour specs unitaires persist
6. [x] `.env.example` + note dans `avancement.md` / bloc `done.md`
7. [ ] (Plus tard) déchiffrement dans les endpoints dashboard conversations
8. [ ] (Infra) HTTPS prod — hors code Nest

---

## 12. Décisions tranchées

| Sujet | Décision |
|-------|----------|
| Front Angular | Aucun changement pour cette feature |
| Redis | Pas de chiffrement (TTL) |
| E2E navigateur | Non |
| Algorithme | AES-256-GCM + HMAC phone pour lookup |
| Données test déjà en clair | Drop OK (re-persist au prochain message) |
| Ordre de livraison | Chiffrement au repos d’abord ; HTTPS en déploiement prod |

---

## 13. Fichiers prévus (touch list)

- `src/crypto/field-encryption.service.ts` (+ spec)
- `src/crypto/crypto.module.ts`
- `src/config/configuration.ts`
- `src/conversation/entities/conversation.entity.ts`
- `src/conversation/entities/message.entity.ts`
- `src/conversation/conversation-persistence.service.ts` (+ spec)
- `src/database/migrations/...EncryptConversationFields.ts`
- `.env.example`
- `docs/avancement.md`, `docs/done.md` (après implémentation)
