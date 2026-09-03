import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ConversationPersistenceService } from './conversation-persistence.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

describe('ConversationPersistenceService', () => {
  let service: ConversationPersistenceService;

  const conversationsFindOne = jest.fn();
  const conversationsCreate = jest.fn(
    (value: Partial<Conversation>) => value as Conversation,
  );
  const conversationsSave = jest.fn();
  const messagesCreate = jest.fn(
    (value: Partial<Message>) => value as Message,
  );
  const messagesSave = jest.fn();

  beforeEach(async () => {
    conversationsFindOne.mockReset();
    conversationsCreate.mockClear();
    conversationsSave.mockReset();
    messagesCreate.mockClear();
    messagesSave.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationPersistenceService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: {
            findOne: conversationsFindOne,
            create: conversationsCreate,
            save: conversationsSave,
          },
        },
        {
          provide: getRepositoryToken(Message),
          useValue: {
            create: messagesCreate,
            save: messagesSave,
          },
        },
      ],
    }).compile();

    service = module.get(ConversationPersistenceService);
  });

  it('réutilise une conversation active et y ajoute le message', async () => {
    const conversation = {
      id: 'conv-1',
      businessId: 'biz-1',
      clientPhone: '221700000000',
      status: 'active',
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    } as Conversation;

    conversationsFindOne.mockResolvedValue(conversation);
    conversationsSave.mockImplementation(async (value) => value);
    messagesSave.mockImplementation(async (value) => value);

    await service.persistMessage(
      'biz-1',
      '221700000000',
      'user',
      'Bonjour',
    );

    expect(conversationsFindOne).toHaveBeenCalledWith({
      where: {
        businessId: 'biz-1',
        clientPhone: '221700000000',
        status: 'active',
      },
      order: { lastMessageAt: 'DESC' },
    });
    expect(messagesSave).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        role: 'user',
        content: 'Bonjour',
        toolCalls: null,
      }),
    );
    expect(conversationsSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conv-1',
        lastMessageAt: expect.any(Date),
      }),
    );
  });

  it('crée une conversation si aucune active', async () => {
    conversationsFindOne.mockResolvedValue(null);
    conversationsSave.mockResolvedValue({
      id: 'conv-new',
      businessId: 'biz-1',
      clientPhone: '221700000000',
      status: 'active',
    } as Conversation);
    messagesSave.mockImplementation(async (value) => value);

    await service.persistMessage(
      'biz-1',
      '221700000000',
      'assistant',
      'Je vous écoute',
    );

    expect(conversationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        clientPhone: '221700000000',
        status: 'active',
      }),
    );
    expect(messagesSave).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-new',
        role: 'assistant',
        content: 'Je vous écoute',
      }),
    );
  });

  it('récupère la conversation en cas de course unique', async () => {
    const raced = {
      id: 'conv-raced',
      businessId: 'biz-1',
      clientPhone: '221700000000',
      status: 'active',
    } as Conversation;

    conversationsFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced);

    const uniqueError = new QueryFailedError('INSERT', [], new Error('dup'));
    (uniqueError as QueryFailedError & { driverError: { code: string } }).driverError =
      { code: '23505' };

    conversationsSave
      .mockRejectedValueOnce(uniqueError)
      .mockImplementation(async (value) => value);
    messagesSave.mockImplementation(async (value) => value);

    await service.persistMessage(
      'biz-1',
      '221700000000',
      'user',
      'Salut',
    );

    expect(messagesSave).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-raced' }),
    );
  });

  it('ne propage pas les erreurs Postgres', async () => {
    conversationsFindOne.mockRejectedValue(new Error('db down'));

    await expect(
      service.persistMessage('biz-1', '221700000000', 'user', 'x'),
    ).resolves.toBeUndefined();
  });
});
