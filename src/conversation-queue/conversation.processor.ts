import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BusinessesService } from '../businesses/businesses.service';
import { ConversationOrchestratorService } from '../conversation/conversation-orchestrator.service';
import { ConversationSessionService } from '../conversation/conversation-session.service';
import { hasUserMessagesSince } from '../conversation/session.types';
import { RedisService } from '../redis/redis.service';
import { WhatsappClientService } from '../whatsapp-client/whatsapp-client.service';
import { ConversationDebounceService } from './conversation-debounce.service';
import type { ConversationJobPayload } from './conversation-job.types';
import {
  CONVERSATION_QUEUE,
  buildConversationFollowUpKey,
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
    const followUpKey = buildConversationFollowUpKey(businessId, clientPhone);

    const acquired = await this.redisService.tryAcquireLock(
      lockKey,
      CONVERSATION_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      await this.debounceService.scheduleProcessing(job.data);
      return;
    }

    let messageCountAtStart = 0;
    let shouldCheckFollowUp = false;

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

      const session = await this.sessionService.getSession(
        businessId,
        clientPhone,
      );
      messageCountAtStart = session.messages.length;
      shouldCheckFollowUp = true;

      if (session.last_whatsapp_message_id) {
        await this.whatsappClient.markAsReadWithTyping(
          phoneNumberId,
          session.last_whatsapp_message_id,
        );
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Traitement conversation échoué ${businessId}:${clientPhone} : ${message}`,
      );
      throw error;
    } finally {
      await this.redisService.releaseLock(lockKey);

      if (shouldCheckFollowUp) {
        try {
          await this.scheduleFollowUpIfNeeded(
            job.data,
            followUpKey,
            messageCountAtStart,
          );
        } catch (followUpError) {
          const message =
            followUpError instanceof Error
              ? followUpError.message
              : String(followUpError);
          this.logger.error(
            `Follow-up conversation échoué ${businessId}:${clientPhone} : ${message}`,
          );
        }
      }
    }
  }

  private async scheduleFollowUpIfNeeded(
    payload: ConversationJobPayload,
    followUpKey: string,
    messageCountAtStart: number,
  ): Promise<void> {
    const followUpRequested = await this.redisService.consumeFlag(followUpKey);
    const updatedSession = await this.sessionService.getSession(
      payload.businessId,
      payload.clientPhone,
    );
    if (
      followUpRequested ||
      hasUserMessagesSince(updatedSession.messages, messageCountAtStart)
    ) {
      // Pas scheduleProcessing : le job courant est encore `active`.
      await this.debounceService.scheduleFollowUpProcessing(payload);
    }
  }
}
