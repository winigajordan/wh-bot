import { Test, TestingModule } from '@nestjs/testing';
import { BusinessesService } from '../businesses/businesses.service';
import { Business } from '../businesses/entities/business.entity';
import { ConversationOrchestratorService } from '../conversation/conversation-orchestrator.service';
import { ConversationSessionService } from '../conversation/conversation-session.service';
import { RedisService } from '../redis/redis.service';
import { WhatsappClientService } from '../whatsapp-client/whatsapp-client.service';
import { ConversationDebounceService } from './conversation-debounce.service';
import { ConversationProcessor } from './conversation.processor';
import type { ConversationJobPayload } from './conversation-job.types';

describe('ConversationProcessor', () => {
  let processor: ConversationProcessor;
  const findById = jest.fn();
  const processConversation = jest.fn();
  const getSession = jest.fn();
  const sendTextMessage = jest.fn();
  const scheduleProcessing = jest.fn();
  const tryAcquireLock = jest.fn();
  const releaseLock = jest.fn();

  const payload: ConversationJobPayload = {
    businessId: 'biz-1',
    clientPhone: '221779876543',
    phoneNumberId: 'phone-1',
  };

  const business = {
    id: 'biz-1',
    name: 'Chez Fatou',
    status: 'active',
    module: { key: 'restaurant_ordering' },
  } as Business;

  beforeEach(async () => {
    findById.mockReset();
    processConversation.mockReset();
    getSession.mockReset();
    sendTextMessage.mockReset();
    scheduleProcessing.mockReset();
    tryAcquireLock.mockReset();
    releaseLock.mockReset();

    findById.mockResolvedValue(business);
    processConversation.mockResolvedValue('Réponse bot');
    getSession.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Réponse bot' }],
    });
    tryAcquireLock.mockResolvedValue(true);
    releaseLock.mockResolvedValue(undefined);
    sendTextMessage.mockResolvedValue(undefined);
    scheduleProcessing.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationProcessor,
        { provide: BusinessesService, useValue: { findById } },
        {
          provide: ConversationOrchestratorService,
          useValue: { processConversation },
        },
        { provide: ConversationSessionService, useValue: { getSession } },
        { provide: WhatsappClientService, useValue: { sendTextMessage } },
        {
          provide: ConversationDebounceService,
          useValue: { scheduleProcessing },
        },
        {
          provide: RedisService,
          useValue: { tryAcquireLock, releaseLock },
        },
      ],
    }).compile();

    processor = module.get(ConversationProcessor);
  });

  it('traite la conversation et envoie la réponse WhatsApp', async () => {
    await processor.process({ data: payload } as never);

    expect(processConversation).toHaveBeenCalledWith(business, '221779876543');
    expect(sendTextMessage).toHaveBeenCalledWith(
      'phone-1',
      '221779876543',
      'Réponse bot',
    );
    expect(releaseLock).toHaveBeenCalled();
  });

  it('reprogramme si des messages utilisateur arrivent pendant le traitement', async () => {
    getSession.mockResolvedValue({
      messages: [
        { role: 'assistant', content: 'ancienne' },
        { role: 'user', content: 'nouveau pendant traitement' },
      ],
    });

    await processor.process({ data: payload } as never);

    expect(scheduleProcessing).toHaveBeenCalledWith(payload);
  });

  it('reprogramme si le verrou est déjà pris', async () => {
    tryAcquireLock.mockResolvedValue(false);

    await processor.process({ data: payload } as never);

    expect(scheduleProcessing).toHaveBeenCalledWith(payload);
    expect(processConversation).not.toHaveBeenCalled();
  });
});
