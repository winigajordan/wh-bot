import type {
  ParsedIncomingTextMessage,
  WhatsAppWebhookMessage,
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
        const parsed = parseWebhookMessage(message, phoneNumberId);
        if (parsed) {
          results.push(parsed);
        }
      }
    }
  }

  return results;
}

function parseWebhookMessage(
  message: WhatsAppWebhookMessage,
  phoneNumberId: string,
): ParsedIncomingTextMessage | null {
  if (message.type === 'text' && message.text?.body) {
    return {
      phoneNumberId,
      from: message.from,
      messageId: message.id,
      text: message.text.body,
      timestamp: message.timestamp,
    };
  }

  if (message.type === 'interactive') {
    const title = extractInteractiveTitle(message.interactive);
    if (!title) {
      return null;
    }

    return {
      phoneNumberId,
      from: message.from,
      messageId: message.id,
      text: title,
      timestamp: message.timestamp,
    };
  }

  return null;
}

function extractInteractiveTitle(
  interactive: WhatsAppWebhookMessage['interactive'],
): string | null {
  if (!interactive) {
    return null;
  }

  if (interactive.type === 'button_reply' && interactive.button_reply?.title) {
    return interactive.button_reply.title;
  }

  if (interactive.type === 'list_reply' && interactive.list_reply?.title) {
    return interactive.list_reply.title;
  }

  return null;
}
