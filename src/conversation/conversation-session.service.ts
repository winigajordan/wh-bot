import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  buildSessionKey,
  ConversationSession,
  createEmptySession,
  SESSION_TTL_SECONDS,
} from './session.types';

@Injectable()
export class ConversationSessionService {
  private readonly logger = new Logger(ConversationSessionService.name);

  constructor(private readonly redis: RedisService) {}

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
  ): Promise<ConversationSession> {
    return this.appendMessage(businessId, clientPhone, 'user', content);
  }

  async appendAssistantMessage(
    businessId: string,
    clientPhone: string,
    content: string,
  ): Promise<ConversationSession> {
    return this.appendMessage(businessId, clientPhone, 'assistant', content);
  }

  private async appendMessage(
    businessId: string,
    clientPhone: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<ConversationSession> {
    const key = buildSessionKey(businessId, clientPhone);
    const session = this.parseSession(await this.redis.getSession(key));

    session.messages.push({ role, content });
    session.last_activity = new Date().toISOString();

    this.logger.log(
      `Écriture session Redis clé=${key} ttl=${SESSION_TTL_SECONDS}s messages=${session.messages.length}`,
    );
    await this.redis.setSession(key, session, SESSION_TTL_SECONDS);
    this.logger.log(`Écriture session Redis OK clé=${key}`);

    return session;
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
      last_activity:
        typeof data.last_activity === 'string'
          ? data.last_activity
          : empty.last_activity,
    };
  }
}
