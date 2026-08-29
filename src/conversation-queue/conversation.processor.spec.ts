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
  const sendOutboundMessage = jest.fn();
  const markAsReadWithTyping = jest.fn();
  const scheduleProcessing = jest.fn();
  const scheduleFollowUpProcessing = jest.fn();
  const tryAcquireLock = jest.fn();
  const releaseLock = jest.fn();
  const consumeFlag = jest.fn();

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

  async function createProcessor(): Promise<ConversationProcessor> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationProcessor,
        { provide: BusinessesService, useValue: { findById } },
        {
          provide: ConversationOrchestratorService,
          useValue: { processConversation },
        },
        { provide: ConversationSessionService, useValue: { getSession } },
        {
          provide: WhatsappClientService,
          useValue: { sendTextMessage, sendOutboundMessage, markAsReadWithTyping },
        },
        {
          provide: ConversationDebounceService,
          useValue: { scheduleProcessing, scheduleFollowUpProcessing },
        },
        {
          provide: RedisService,
          useValue: { tryAcquireLock, releaseLock, consumeFlag },
        },
      ],
    }).compile();

    return module.get(ConversationProcessor);
  }

  beforeEach(async () => {
    findById.mockReset();
    processConversation.mockReset();
    getSession.mockReset();
    sendTextMessage.mockReset();
    sendOutboundMessage.mockReset();
    markAsReadWithTyping.mockReset();
    scheduleProcessing.mockReset();
    scheduleFollowUpProcessing.mockReset();
    tryAcquireLock.mockReset();
    releaseLock.mockReset();
    consumeFlag.mockReset();

    findById.mockResolvedValue(business);
    processConversation.mockResolvedValue({
      outbound: { type: 'text', body: 'Réponse bot' },
    });
    getSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Salut' }],
      last_whatsapp_message_id: 'wamid.test',
    });
    tryAcquireLock.mockResolvedValue(true);
    releaseLock.mockResolvedValue(undefined);
    consumeFlag.mockResolvedValue(false);
    sendOutboundMessage.mockResolvedValue(undefined);
    markAsReadWithTyping.mockResolvedValue(undefined);
    scheduleProcessing.mockResolvedValue(undefined);
    scheduleFollowUpProcessing.mockResolvedValue(undefined);

    processor = await createProcessor();
  });

  it('appelle read + typing avant Claude', async () => {
    await processor.process({ data: payload } as never);

    expect(markAsReadWithTyping).toHaveBeenCalledWith(
      'phone-1',
      'wamid.test',
    );
    expect(processConversation).toHaveBeenCalled();
  });

  it('traite la conversation et envoie la réponse WhatsApp', async () => {
    await processor.process({ data: payload } as never);

    expect(processConversation).toHaveBeenCalledWith(business, '221779876543');
    expect(sendOutboundMessage).toHaveBeenCalledWith(
      'phone-1',
      '221779876543',
      { type: 'text', body: 'Réponse bot' },
    );
    expect(releaseLock).toHaveBeenCalled();
  });

  it('reprogramme si un message user arrive pendant Claude (sous la réponse)', async () => {
    getSession
      .mockResolvedValueOnce({
        messages: [{ role: 'user', content: 'A' }],
        last_whatsapp_message_id: 'wamid.a',
      })
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'A' },
          { role: 'user', content: 'B pendant' },
          { role: 'assistant', content: 'réponse à A' },
        ],
      });

    await processor.process({ data: payload } as never);

    expect(scheduleFollowUpProcessing).toHaveBeenCalledWith(payload);
    expect(scheduleProcessing).not.toHaveBeenCalled();
  });

  it('reprogramme si le flag follow-up est posé pendant le traitement', async () => {
    consumeFlag.mockResolvedValue(true);
    getSession
      .mockResolvedValueOnce({
        messages: [{ role: 'user', content: 'A' }],
        last_whatsapp_message_id: 'wamid.a',
      })
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'A' },
          { role: 'assistant', content: 'ok' },
        ],
      });

    await processor.process({ data: payload } as never);

    expect(scheduleFollowUpProcessing).toHaveBeenCalledWith(payload);
    expect(scheduleProcessing).not.toHaveBeenCalled();
  });

  it('envoie un message interactif si l’orchestrateur le demande', async () => {
    processConversation.mockResolvedValue({
      outbound: {
        type: 'buttons',
        bodyText: 'Confirmez-vous ?',
        buttons: [
          { id: 'confirm_order_yes', title: 'Oui, je confirme' },
          { id: 'confirm_order_no', title: 'Non, je modifie' },
        ],
      },
    });

    await processor.process({ data: payload } as never);

    expect(sendOutboundMessage).toHaveBeenCalledWith(
      'phone-1',
      '221779876543',
      expect.objectContaining({ type: 'buttons' }),
    );
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('reprogramme si le verrou est déjà pris', async () => {
    tryAcquireLock.mockResolvedValue(false);

    await processor.process({ data: payload } as never);

    expect(scheduleProcessing).toHaveBeenCalledWith(payload);
    expect(processConversation).not.toHaveBeenCalled();
  });
});
