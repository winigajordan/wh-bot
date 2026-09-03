import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { FieldEncryptionService } from '../crypto/field-encryption.service';
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
    private readonly encryption: FieldEncryptionService,
  ) {}

  /**
   * Archive un message en Postgres (contenu + téléphone chiffrés).
   * Ne propage jamais d’erreur (Redis reste la source live du bot).
   */
  async persistMessage(
    businessId: string,
    clientPhone: string,
    role: MessageRole,
    content: string,
  ): Promise<void> {
    try {
      if (!this.encryption.isReady()) {
        this.logger.warn(
          `Persist ignoré (chiffrement non prêt) business=${businessId} role=${role}`,
        );
        return;
      }

      const phoneHash = this.encryption.hashPhone(clientPhone);
      const conversation = await this.ensureActiveConversation(
        businessId,
        clientPhone,
        phoneHash,
      );

      const contentEncrypted =
        content.length > 0 ? this.encryption.encrypt(content) : null;

      await this.messages.save(
        this.messages.create({
          conversationId: conversation.id,
          role,
          contentEncrypted,
          toolCalls: null,
        }),
      );

      conversation.lastMessageAt = new Date();
      await this.conversations.save(conversation);

      this.logger.log(
        `Persist OK business=${businessId} conversation=${conversation.id} role=${role}`,
      );
    } catch (error) {
      this.logger.error(
        `Persist message échoué business=${businessId} role=${role}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async ensureActiveConversation(
    businessId: string,
    clientPhone: string,
    phoneHash = this.encryption.hashPhone(clientPhone),
  ): Promise<Conversation> {
    const existing = await this.findActiveConversation(businessId, phoneHash);
    if (existing) {
      return existing;
    }

    try {
      return await this.conversations.save(
        this.conversations.create({
          businessId,
          clientPhoneHash: phoneHash,
          clientPhoneEncrypted: this.encryption.encrypt(clientPhone),
          status: 'active',
          lastMessageAt: new Date(),
        }),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const raced = await this.findActiveConversation(businessId, phoneHash);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private findActiveConversation(
    businessId: string,
    clientPhoneHash: string,
  ): Promise<Conversation | null> {
    return this.conversations.findOne({
      where: { businessId, clientPhoneHash, status: 'active' },
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
