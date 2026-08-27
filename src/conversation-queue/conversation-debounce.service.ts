import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import type { ConversationJobPayload } from './conversation-job.types';
import {
  CONVERSATION_FOLLOW_UP_TTL_SECONDS,
  CONVERSATION_PROCESS_JOB,
  CONVERSATION_QUEUE,
  buildConversationFollowUpJobId,
  buildConversationFollowUpKey,
  buildConversationJobId,
} from './conversation-queue.constants';

@Injectable()
export class ConversationDebounceService {
  private readonly logger = new Logger(ConversationDebounceService.name);

  constructor(
    @InjectQueue(CONVERSATION_QUEUE)
    private readonly queue: Queue<ConversationJobPayload>,
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async scheduleProcessing(payload: ConversationJobPayload): Promise<void> {
    const jobId = buildConversationJobId(
      payload.businessId,
      payload.clientPhone,
    );
    const delay = this.getDelayMs();

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'delayed' || state === 'waiting') {
        await existing.remove();
        this.logger.debug(`Debounce reprogrammé pour ${jobId}`);
      } else if (state === 'active') {
        const followUpKey = buildConversationFollowUpKey(
          payload.businessId,
          payload.clientPhone,
        );
        await this.redisService.markFlag(
          followUpKey,
          CONVERSATION_FOLLOW_UP_TTL_SECONDS,
        );
        this.logger.debug(
          `Traitement en cours pour ${jobId}, follow-up marqué`,
        );
        return;
      }
    }

    await this.queue.add(CONVERSATION_PROCESS_JOB, payload, {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: 100,
    });

    this.logger.debug(
      `Job conversation programmé ${jobId} delay=${delay}ms`,
    );
  }

  /**
   * À appeler depuis le finally du processor : le job courant est encore
   * `active`, donc scheduleProcessing refuserait d’enfiler. On utilise un
   * jobId follow-up distinct.
   */
  async scheduleFollowUpProcessing(
    payload: ConversationJobPayload,
  ): Promise<void> {
    const primaryJobId = buildConversationJobId(
      payload.businessId,
      payload.clientPhone,
    );
    const followUpJobId = buildConversationFollowUpJobId(
      payload.businessId,
      payload.clientPhone,
    );
    const delay = this.getDelayMs();

    await this.removeIfPending(primaryJobId);
    await this.removeIfPending(followUpJobId);

    const existingFollowUp = await this.queue.getJob(followUpJobId);
    const followUpState = existingFollowUp
      ? await existingFollowUp.getState()
      : null;

    const jobId =
      followUpState === 'active'
        ? `${followUpJobId}__${Date.now()}`
        : followUpJobId;

    await this.queue.add(CONVERSATION_PROCESS_JOB, payload, {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: 100,
    });

    this.logger.debug(
      `Job conversation follow-up programmé ${jobId} delay=${delay}ms`,
    );
  }

  private getDelayMs(): number {
    return this.config.get<number>('conversation.debounceDelayMs') ?? 2500;
  }

  private async removeIfPending(jobId: string): Promise<void> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) {
      return;
    }
    const state = await existing.getState();
    if (state === 'delayed' || state === 'waiting') {
      await existing.remove();
    }
  }
}
