import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { ConversationJobPayload } from './conversation-job.types';
import { ConversationDebounceService } from './conversation-debounce.service';
import {
  CONVERSATION_PROCESS_JOB,
  CONVERSATION_QUEUE,
} from './conversation-queue.constants';

describe('ConversationDebounceService', () => {
  let service: ConversationDebounceService;
  const add = jest.fn();
  const getJob = jest.fn();
  const remove = jest.fn();
  const getState = jest.fn();

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
    add.mockResolvedValue(undefined);
    getJob.mockResolvedValue(null);

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
        jobId: 'biz-1:221779876543',
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

  it('ne reprogramme pas un job actif', async () => {
    getJob.mockResolvedValue({ getState, remove });
    getState.mockResolvedValue('active');

    await service.scheduleProcessing(payload);

    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
