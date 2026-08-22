# Gestion des messages simultanés — Debounce + verrou par conversation

> À donner à Cursor. Ce document introduit un mécanisme de regroupement des messages rapprochés avant appel à Claude, pour résoudre deux problèmes : (1) race condition sur la session Redis quand plusieurs messages arrivent quasi simultanément, (2) UX dégradée quand un client tape sa pensée en plusieurs bulles WhatsApp.

## 1. Problème actuel

Le webhook traite chaque message entrant de façon indépendante et immédiate : à réception, il appelle directement l'orchestrateur (lecture session → Claude → écriture réponse). Si deux messages du même client arrivent à quelques secondes d'intervalle (rafale humaine, ou double-envoi réseau), deux traitements peuvent s'exécuter en parallèle sur la même session Redis, avec un risque de :

- perte de mise à jour sur le panier (`add_to_cart` concurrent qui s'écrase)
- réponses dupliquées ou dans le désordre
- contexte de conversation incohérent (un traitement démarre avant que l'autre ait fini d'écrire)

## 2. Solution : file d'attente avec debounce + verrou par conversation

Introduire **BullMQ** (déjà naturel puisque Redis est en place) pour différer et regrouper le traitement des messages, avec la garantie qu'un seul traitement Claude tourne à la fois par conversation.

### Principe

1. Le webhook, à réception d'un message, **continue** d'appeler `appendUserMessage` (inchangé) mais **n'appelle plus l'orchestrateur directement**
2. Il programme (ou reprogramme) un job différé dans une queue BullMQ, avec :
   - `jobId` déterministe = `{business_id}:{client_phone}` (clé de déduplication naturelle de BullMQ — un nouveau job avec le même `jobId` remplace/repousse l'ancien)
   - `delay` = ~2500ms (à ajuster empiriquement)
3. Si un nouveau message arrive pour la même conversation avant l'expiration du délai, le job précédent est annulé/reprogrammé (comportement natif d'un `jobId` réutilisé avec `removeOnComplete`/replace, à valider selon l'API BullMQ retenue)
4. Une fois le délai écoulé sans nouveau message, **un seul worker traite le job** : il relit la session Redis (qui contient tous les messages accumulés depuis le dernier traitement), appelle l'orchestrateur une seule fois, envoie la réponse

### Concurrence : verrou par conversation

Le worker BullMQ doit être configuré avec une **concurrence limitée par clé de conversation**, pas juste un worker global séquentiel (sinon deux conversations différentes se bloqueraient inutilement l'une l'autre). Deux options possibles, à choisir selon ce qui est le plus simple avec BullMQ :

- Utiliser le `jobId` déterministe comme mécanisme naturel de déduplication/remplacement (une conversation = un seul job en attente à la fois, donc pas de concurrence possible sur cette conversation par construction)
- Si besoin d'un verrou explicite en plus : `RedisService` peut exposer un lock simple (`SET NX` avec expiration courte) autour de l'exécution du job, à lever une fois le traitement terminé

Le point non négociable : **jamais deux traitements Claude simultanés sur la même paire `(business_id, client_phone)`**.

## 3. Ce qui doit distinguer "nouveau message d'une conversation déjà en file" vs "premier message"

- Si un job est déjà en attente pour cette conversation (delay pas encore écoulé) → le nouveau message doit repousser ce délai (comportement debounce classique), pas créer un second job parallèle
- Si aucun job n'est en attente (conversation inactive) → créer un nouveau job avec le délai standard

## 4. Impact sur le code existant

### Webhook (`webhook.controller.ts`)
- Garde l'appel à `appendUserMessage` (session Redis mise à jour immédiatement, comme avant)
- Retire l'appel direct à `conversationOrchestrator.handleIncomingMessage`
- Ajoute l'appel à un nouveau service, ex: `ConversationDebounceService.scheduleProcessing(business, from)`

### Nouveau module `conversation-queue` (ou intégré à `conversation/`)
- `ConversationDebounceService.scheduleProcessing(business, from)` — programme/reprogramme le job BullMQ
- `ConversationProcessorWorker` — consomme les jobs, appelle `conversationOrchestrator.handleIncomingMessage` puis `appendAssistantMessage` puis `whatsappClient.sendTextMessage` (logique actuellement dans le webhook controller, à déplacer ici)

### Ce qui ne change pas
- `ConversationOrchestratorService.handleIncomingMessage` — logique interne identique, juste appelée depuis le worker au lieu du controller
- Tous les tools, le registre de modules, la logique métier resto — aucun changement

## 5. Configuration

- `REDIS_URL` déjà disponible, réutilisable comme connexion BullMQ
- Package : `bullmq` + `@nestjs/bullmq`
- `delay` du debounce : commencer à 2500ms, exposer en config (`conversation.debounceDelayMs`) pour pouvoir l'ajuster sans redéploiement de code

## 6. Non concerné par ce changement

- La signature/vérification HMAC du webhook (avant la queue, inchangé)
- La revalidation stricte de `confirm_order` (reste un garde-fou indépendant, toujours utile même avec ce mécanisme)
- Les tools eux-mêmes

## 7. Test de validation

- Envoyer 3 messages WhatsApp coup sur coup (moins de 2-3s d'écart) vers le même business → vérifier qu'un seul appel Claude est déclenché, avec les 3 messages dans le contexte, et une seule réponse envoyée
- Envoyer un message, attendre 5s, en envoyer un autre → vérifier que 2 traitements distincts ont bien lieu (le debounce ne doit pas fusionner des messages trop espacés)
- Envoyer des messages vers 2 conversations différentes en même temps → vérifier qu'elles sont traitées indépendamment sans se bloquer