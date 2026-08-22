import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BusinessesService } from '../businesses/businesses.service';
import { ConversationOrchestratorService } from '../conversation/conversation-orchestrator.service';
import { ConversationSessionService } from '../conversation/conversation-session.service';
import { hasPendingUserMessages } from '../conversation/session.types';
import { RedisService } from '../redis/redis.service';
import { WhatsappClientService } from '../whatsapp-client/whatsapp-client.service';
import { ConversationDebounceService } from './conversation-debounce.service';
import type { ConversationJobPayload } from './conversation-job.types';
import {
  CONVERSATION_QUEUE,
  buildConversationLockKey,
} from './conversation-queue.constants';

const CONVERSATION_LOCK_TTL_SECONDS = 120;

@Processor(CONVERSATION_QUEUE)
export class ConversationProcessor extends WorkerHost {
  private readonly logger = new Logger(ConversationProcessor.name);

  constructor(
    private readonly businessesService: BusinessesService,
    private readonly orchestrator: ConversationOrchestratorService,
    private readonly sessionService: ConversationSessionService,
    private readonly whatsappClient: WhatsappClientService,
    private readonly debounceService: ConversationDebounceService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<ConversationJobPayload>): Promise<void> {
    const { businessId, clientPhone, phoneNumberId } = job.data;
    const lockKey = buildConversationLockKey(businessId, clientPhone);

    const acquired = await this.redisService.tryAcquireLock(
      lockKey,
      CONVERSATION_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      await this.debounceService.scheduleProcessing(job.data);
      return;
    }

    try {
      const business = await this.businessesService.findById(businessId);
      if (!business) {
        this.logger.warn(`Business introuvable pour job ${job.id}`);
        return;
      }

      if (business.status !== 'active') {
        this.logger.warn(
          `Business ${business.id} ignoré — status=${business.status}`,
        );
        return;
      }

      const reply = await this.orchestrator.processConversation(
        business,
        clientPhone,
      );

      if (reply) {
        await this.whatsappClient.sendTextMessage(
          phoneNumberId,
          clientPhone,
          reply,
        );
      }

      const session = await this.sessionService.getSession(
        businessId,
        clientPhone,
      );
      if (hasPendingUserMessages(session.messages)) {
        await this.debounceService.scheduleProcessing(job.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Traitement conversation échoué ${businessId}:${clientPhone} : ${message}`,
      );
      throw error;
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }
}
