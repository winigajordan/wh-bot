export const CONVERSATION_QUEUE = 'conversation';

export const CONVERSATION_PROCESS_JOB = 'process';

/** BullMQ interdit « : » dans les jobId custom — séparateur dédié. */
export function buildConversationJobId(
  businessId: string,
  clientPhone: string,
): string {
  return `${businessId}__${clientPhone}`;
}

export function buildConversationLockKey(
  businessId: string,
  clientPhone: string,
): string {
  return `lock:conversation:${businessId}:${clientPhone}`;
}

/** Flag Redis : un message est arrivé pendant qu’un job était déjà active. */
export function buildConversationFollowUpKey(
  businessId: string,
  clientPhone: string,
): string {
  return `followup:conversation:${businessId}:${clientPhone}`;
}

/**
 * JobId distinct du job principal — permet d’enfiler un follow-up
 * pendant que le job courant est encore `active` (dans le finally).
 */
export function buildConversationFollowUpJobId(
  businessId: string,
  clientPhone: string,
): string {
  return `${buildConversationJobId(businessId, clientPhone)}__fu`;
}

export const CONVERSATION_FOLLOW_UP_TTL_SECONDS = 300;
