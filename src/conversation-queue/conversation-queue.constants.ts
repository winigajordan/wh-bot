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
