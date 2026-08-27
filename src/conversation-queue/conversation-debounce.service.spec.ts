import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import type { ConversationJobPayload } from './conversation-job.types';
import { ConversationDebounceService } from './conversation-debounce.service';
import {
  CONVERSATION_FOLLOW_UP_TTL_SECONDS,
  CONVERSATION_PROCESS_JOB,
  CONVERSATION_QUEUE,
} from './conversation-queue.constants';

describe('ConversationDebounceService', () => {
  let service: ConversationDebounceService;
  const add = jest.fn();
  const getJob = jest.fn();
  const remove = jest.fn();
  const getState = jest.fn();
  const markFlag = jest.fn();

  const payload: ConversationJobPayload = {
    businessId: 'biz-1',
    clientPhone: '221779876543',
    phoneNumberId: 'phone-1',
  };

  beforeEach(async () => {
    add.mockReset();
    getJob.mockReset();
    remove.mockReset();
    getState.mockReset();
    markFlag.mockReset();
    add.mockResolvedValue(undefined);
    getJob.mockResolvedValue(null);
    markFlag.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationDebounceService,
        {
          provide: getQueueToken(CONVERSATION_QUEUE),
          useValue: {
            add,
            getJob,
          } satisfies Partial<Queue<ConversationJobPayload>>,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'conversation.debounceDelayMs' ? 2500 : undefined,
          },
        },
        {
          provide: RedisService,
          useValue: { markFlag },
        },
      ],
    }).compile();

    service = module.get(ConversationDebounceService);
  });

  it('programme un job différé avec jobId déterministe', async () => {
    await service.scheduleProcessing(payload);

    expect(add).toHaveBeenCalledWith(
      CONVERSATION_PROCESS_JOB,
      payload,
      expect.objectContaining({
        jobId: 'biz-1__221779876543',
        delay: 2500,
      }),
    );
  });

  it('reprogramme un job en attente (debounce)', async () => {
    getJob.mockResolvedValue({ getState, remove });
    getState.mockResolvedValue('delayed');

    await service.scheduleProcessing(payload);

    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalled();
  });

  it('marque un follow-up si un job est actif', async () => {
    getJob.mockResolvedValue({ getState, remove });
    getState.mockResolvedValue('active');

    await service.scheduleProcessing(payload);

    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(markFlag).toHaveBeenCalledWith(
      'followup:conversation:biz-1:221779876543',
      CONVERSATION_FOLLOW_UP_TTL_SECONDS,
    );
  });

  it('programme un job follow-up avec un jobId distinct', async () => {
    getJob.mockResolvedValue(null);

    await service.scheduleFollowUpProcessing(payload);

    expect(add).toHaveBeenCalledWith(
      CONVERSATION_PROCESS_JOB,
      payload,
      expect.objectContaining({
        jobId: 'biz-1__221779876543__fu',
        delay: 2500,
      }),
    );
  });
});
