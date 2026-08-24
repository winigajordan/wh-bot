# Indicateur "en train d'écrire" + accusé de lecture

> À donner à Cursor. Ajoute un appel à l'API WhatsApp pour marquer le message comme lu et afficher l'indicateur "en train d'écrire" pendant que le bot prépare sa réponse. Fonctionnalité officielle de la Cloud API, pas un hack.

## Comportement voulu

Au tout début du traitement d'une conversation par le worker (`ConversationProcessor`), avant l'appel à Claude : envoyer un appel à l'API WhatsApp qui marque le dernier message reçu comme lu et déclenche l'indicateur "en train d'écrire" côté client.

## Endpoint WhatsApp

```
POST https://graph.facebook.com/{API_VERSION}/{phone_number_id}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Content-Type: application/json

{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "<wamid_du_dernier_message_recu>",
  "typing_indicator": { "type": "text" }
}
```

Marquer un message comme lu marque aussi automatiquement tous les messages précédents de la conversation comme lus. L'indicateur "en train d'écrire" reste affiché jusqu'à l'envoi de la réponse, ou 25 secondes maximum si le traitement prend plus longtemps.

## Fichiers à modifier

### `src/whatsapp-client/whatsapp-client.service.ts`
Ajouter une méthode :
```typescript
markAsReadWithTyping(phoneNumberId: string, messageId: string): Promise<void>
```
Même pattern d'erreur que `sendTextMessage` : logger en cas d'échec, ne jamais lever d'exception qui bloquerait le flow (l'indicateur est un plus UX, pas une étape critique — son échec ne doit jamais empêcher l'envoi de la vraie réponse).

### `src/conversation-queue/conversation.processor.ts`
Appeler `markAsReadWithTyping` juste après l'acquisition du verrou Redis, avant l'appel à `processConversation` (donc avant l'appel Claude).

**Il faut le `message_id` du dernier message WhatsApp reçu pour cette conversation** — vérifier que ce champ est bien conservé quelque part dans la session Redis (probablement déjà présent depuis le parsing du webhook en Phase 1 — `messageId` était dans `ParsedIncomingTextMessage`). Si ce n'est pas actuellement stocké en session, l'ajouter à la structure de session (`session.types.ts`) au moment de `appendUserMessage`.

## Ce qui ne change pas

- Le reste du flow (debounce, verrou, appel Claude, `sendTextMessage` de la réponse finale) reste identique
- Pas de nouvel endpoint HTTP côté NestJS, juste un appel sortant supplémentaire vers l'API Meta

## Test de validation

Envoyer un message WhatsApp vers un des 2 numéros business et observer côté téléphone :
- Le message envoyé passe aux coches bleues (lu) quasiment immédiatement
- L'indicateur "en train d'écrire..." apparaît pendant que le bot traite (surtout visible si la requête Claude prend 2-3 secondes ou plus, ex: avec plusieurs tool calls)
- L'indicateur disparaît au moment où la réponse arrive