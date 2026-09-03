import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConversationPersistenceService } from './conversation-persistence.service';
import {
  buildSessionKey,
  ConversationSession,
  createEmptySession,
  SESSION_TTL_SECONDS,
} from './session.types';

@Injectable()
export class ConversationSessionService {
  private readonly logger = new Logger(ConversationSessionService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly persistence: ConversationPersistenceService,
  ) {}

  async getSession(
    businessId: string,
    clientPhone: string,
  ): Promise<ConversationSession> {
    const key = buildSessionKey(businessId, clientPhone);
    return this.parseSession(await this.redis.getSession(key));
  }

  async appendUserMessage(
    businessId: string,
    clientPhone: string,
    content: string,
    whatsappMessageId?: string,
  ): Promise<ConversationSession> {
    return this.appendMessage(
      businessId,
      clientPhone,
      'user',
      content,
      whatsappMessageId,
    );
  }

  async appendAssistantMessage(
    businessId: string,
    clientPhone: string,
    content: string,
    /** Insère la réponse juste après les N messages vus par Claude (garde les user arrivés pendant l’appel). */
    insertAfterCount?: number,
  ): Promise<ConversationSession> {
    const key = buildSessionKey(businessId, clientPhone);
    const session = this.parseSession(await this.redis.getSession(key));

    const message = { role: 'assistant' as const, content };
    if (
      typeof insertAfterCount === 'number' &&
      Number.isFinite(insertAfterCount) &&
      insertAfterCount >= 0 &&
      insertAfterCount <= session.messages.length
    ) {
      session.messages.splice(insertAfterCount, 0, message);
    } else {
      session.messages.push(message);
    }

    session.last_activity = new Date().toISOString();

    this.logger.log(
      `Écriture session Redis clé=${key} ttl=${SESSION_TTL_SECONDS}s messages=${session.messages.length}`,
    );
    await this.redis.setSession(key, session, SESSION_TTL_SECONDS);
    this.logger.log(`Écriture session Redis OK clé=${key}`);

    this.schedulePersist(businessId, clientPhone, 'assistant', content);

    return session;
  }

  async mutateSession(
    businessId: string,
    clientPhone: string,
    mutate: (session: ConversationSession) => void,
  ): Promise<ConversationSession> {
    const key = buildSessionKey(businessId, clientPhone);
    const session = this.parseSession(await this.redis.getSession(key));
    mutate(session);
    session.last_activity = new Date().toISOString();
    await this.redis.setSession(key, session, SESSION_TTL_SECONDS);
    return session;
  }

  private async appendMessage(
    businessId: string,
    clientPhone: string,
    role: 'user' | 'assistant',
    content: string,
    whatsappMessageId?: string,
  ): Promise<ConversationSession> {
    const key = buildSessionKey(businessId, clientPhone);
    const session = this.parseSession(await this.redis.getSession(key));

    session.messages.push({ role, content });
    if (role === 'user' && whatsappMessageId) {
      session.last_whatsapp_message_id = whatsappMessageId;
    }
    session.last_activity = new Date().toISOString();

    this.logger.log(
      `Écriture session Redis clé=${key} ttl=${SESSION_TTL_SECONDS}s messages=${session.messages.length}`,
    );
    await this.redis.setSession(key, session, SESSION_TTL_SECONDS);
    this.logger.log(`Écriture session Redis OK clé=${key}`);

    this.schedulePersist(businessId, clientPhone, role, content);

    return session;
  }

  private schedulePersist(
    businessId: string,
    clientPhone: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    void this.persistence.persistMessage(
      businessId,
      clientPhone,
      role,
      content,
    );
  }

  private parseSession(raw: object | null): ConversationSession {
    if (!raw || typeof raw !== 'object') {
      return createEmptySession();
    }

    const data = raw as Partial<ConversationSession>;
    const empty = createEmptySession(
      typeof data.last_activity === 'string'
        ? data.last_activity
        : new Date().toISOString(),
    );

    return {
      messages: Array.isArray(data.messages) ? data.messages : empty.messages,
      cart: Array.isArray(data.cart) ? data.cart : empty.cart,
      delivery_info:
        data.delivery_info === null || typeof data.delivery_info === 'object'
          ? (data.delivery_info ?? null)
          : null,
      order_note:
        typeof data.order_note === 'string'
          ? data.order_note
          : data.order_note === null
            ? null
            : empty.order_note,
      last_whatsapp_message_id:
        typeof data.last_whatsapp_message_id === 'string'
          ? data.last_whatsapp_message_id
          : data.last_whatsapp_message_id === null
            ? null
            : empty.last_whatsapp_message_id,
      last_activity:
        typeof data.last_activity === 'string'
          ? data.last_activity
          : empty.last_activity,
    };
  }
}
