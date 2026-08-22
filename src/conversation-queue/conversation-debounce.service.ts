import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { ConversationJobPayload } from './conversation-job.types';
import {
  CONVERSATION_PROCESS_JOB,
  CONVERSATION_QUEUE,
  buildConversationJobId,
} from './conversation-queue.constants';

@Injectable()
export class ConversationDebounceService {
  private readonly logger = new Logger(ConversationDebounceService.name);

  constructor(
    @InjectQueue(CONVERSATION_QUEUE)
    private readonly queue: Queue<ConversationJobPayload>,
    private readonly config: ConfigService,
  ) {}

  async scheduleProcessing(payload: ConversationJobPayload): Promise<void> {
    const jobId = buildConversationJobId(
      payload.businessId,
      payload.clientPhone,
    );
    const delay =
      this.config.get<number>('conversation.debounceDelayMs') ?? 2500;

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'delayed' || state === 'waiting') {
        await existing.remove();
        this.logger.debug(`Debounce reprogrammé pour ${jobId}`);
      } else if (state === 'active') {
        this.logger.debug(
          `Traitement en cours pour ${jobId}, report après exécution`,
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
}
