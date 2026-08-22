export const CONVERSATION_QUEUE = 'conversation';

export const CONVERSATION_PROCESS_JOB = 'process';

export function buildConversationJobId(
  businessId: string,
  clientPhone: string,
): string {
  return `${businessId}:${clientPhone}`;
}

export function buildConversationLockKey(
  businessId: string,
  clientPhone: string,
): string {
  return `lock:conversation:${businessId}:${clientPhone}`;
}
