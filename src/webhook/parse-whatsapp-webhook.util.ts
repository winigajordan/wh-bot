import type {
  ParsedIncomingTextMessage,
  WhatsAppWebhookPayload,
} from './whatsapp-webhook.types';

export function parseIncomingTextMessages(
  rawBody: Buffer,
): ParsedIncomingTextMessage[] {
  let payload: WhatsAppWebhookPayload;

  try {
    payload = JSON.parse(rawBody.toString('utf8')) as WhatsAppWebhookPayload;
  } catch {
    return [];
  }

  if (payload.object !== 'whatsapp_business_account') {
    return [];
  }

  const results: ParsedIncomingTextMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) {
        continue;
      }

      for (const message of change.value?.messages ?? []) {
        if (message.type !== 'text' || !message.text?.body) {
          continue;
        }

        results.push({
          phoneNumberId,
          from: message.from,
          messageId: message.id,
          text: message.text.body,
          timestamp: message.timestamp,
        });
      }
    }
  }

  return results;
}
