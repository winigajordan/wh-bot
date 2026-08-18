export type SessionMessageRole = 'user' | 'assistant';

export type SessionMessage = {
  role: SessionMessageRole;
  content: string;
};

export type SessionDeliveryInfo = {
  mode: 'delivery' | 'pickup';
  address_text?: string;
  zone_id?: string;
};

export type SessionCartItem = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  options: unknown[];
};

export type ConversationSession = {
  messages: SessionMessage[];
  cart: SessionCartItem[];
  delivery_info: SessionDeliveryInfo | null;
  last_activity: string;
};

export const SESSION_TTL_SECONDS = 30 * 60;

export function buildSessionKey(
  businessId: string,
  clientPhone: string,
): string {
  return `session:${businessId}:${clientPhone}`;
}

export function createEmptySession(
  lastActivity = new Date().toISOString(),
): ConversationSession {
  return {
    messages: [],
    cart: [],
    delivery_info: null,
    last_activity: lastActivity,
  };
}
