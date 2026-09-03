import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, type MessageRole } from './entities/message.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ConversationPersistenceService {
  private readonly logger = new Logger(ConversationPersistenceService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
  ) {}

  /**
   * Archive un message en Postgres. Ne propage jamais d’erreur
   * (Redis reste la source live du bot).
   */
  async persistMessage(
    businessId: string,
    clientPhone: string,
    role: MessageRole,
    content: string,
  ): Promise<void> {
    try {
      const conversation = await this.ensureActiveConversation(
        businessId,
        clientPhone,
      );

      await this.messages.save(
        this.messages.create({
          conversationId: conversation.id,
          role,
          content,
          toolCalls: null,
        }),
      );

      conversation.lastMessageAt = new Date();
      await this.conversations.save(conversation);
    } catch (error) {
      this.logger.error(
        `Persist message échoué business=${businessId} phone=${clientPhone} role=${role}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async ensureActiveConversation(
    businessId: string,
    clientPhone: string,
  ): Promise<Conversation> {
    const existing = await this.findActiveConversation(
      businessId,
      clientPhone,
    );
    if (existing) {
      return existing;
    }

    try {
      return await this.conversations.save(
        this.conversations.create({
          businessId,
          clientPhone,
          status: 'active',
          lastMessageAt: new Date(),
        }),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const raced = await this.findActiveConversation(
          businessId,
          clientPhone,
        );
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private findActiveConversation(
    businessId: string,
    clientPhone: string,
  ): Promise<Conversation | null> {
    return this.conversations.findOne({
      where: { businessId, clientPhone, status: 'active' },
      order: { lastMessageAt: 'DESC' },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === PG_UNIQUE_VIOLATION;
  }
}
