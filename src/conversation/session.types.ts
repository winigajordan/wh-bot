export type SessionMessageRole = 'user' | 'assistant';

export type SessionMessage = {
  role: SessionMessageRole;
  content: string;
};

export type SessionDeliveryInfo = {
  mode: 'delivery' | 'pickup';
  address_text?: string;
  zone_id?: string;
  zone_name?: string;
  delivery_fee?: number;
};

export type SessionCartItem = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  options: Array<{ name: string; price: number; choice?: string | null }>;
};

export type ConversationSession = {
  messages: SessionMessage[];
  cart: SessionCartItem[];
  delivery_info: SessionDeliveryInfo | null;
  /** Note optionnelle pour la commande (allergies, instructions…). */
  order_note: string | null;
  /** wamid du dernier message entrant WhatsApp (accusé de lecture + typing). */
  last_whatsapp_message_id: string | null;
  last_activity: string;
};

export const SESSION_TTL_SECONDS = 30 * 60;

/** Nombre max de messages (user + assistant) envoyés à Claude. Redis garde tout le TTL. */
export const CLAUDE_MESSAGE_WINDOW = 20;

export function buildSessionKey(
  businessId: string,
  clientPhone: string,
): string {
  return `session:${businessId}:${clientPhone}`;
}

export function sliceMessagesForClaude(
  messages: SessionMessage[],
  windowSize = CLAUDE_MESSAGE_WINDOW,
): SessionMessage[] {
  const sliced = messages.slice(-windowSize);
  const firstUserIndex = sliced.findIndex((message) => message.role === 'user');
  if (firstUserIndex <= 0) {
    return sliced;
  }
  return sliced.slice(firstUserIndex);
}

/** Messages utilisateur reçus depuis la dernière réponse assistant (fin de session). */
export function hasPendingUserMessages(messages: SessionMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      return false;
    }
    if (messages[i].role === 'user') {
      return true;
    }
  }
  return false;
}

export function createEmptySession(
  lastActivity = new Date().toISOString(),
): ConversationSession {
  return {
    messages: [],
    cart: [],
    delivery_info: null,
    order_note: null,
    last_whatsapp_message_id: null,
    last_activity: lastActivity,
  };
}
