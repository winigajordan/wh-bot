import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { FieldEncryptionService } from '../crypto/field-encryption.service';
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
  const hashPhone = jest.fn().mockReturnValue('hash-221700000000');
  const encrypt = jest.fn((value: string) => `enc:${value}`);
  const isReady = jest.fn().mockReturnValue(true);

  beforeEach(async () => {
    conversationsFindOne.mockReset();
    conversationsCreate.mockClear();
    conversationsSave.mockReset();
    messagesCreate.mockClear();
    messagesSave.mockReset();
    hashPhone.mockClear().mockReturnValue('hash-221700000000');
    encrypt.mockClear().mockImplementation((value: string) => `enc:${value}`);
    isReady.mockReset().mockReturnValue(true);

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
        {
          provide: FieldEncryptionService,
          useValue: { hashPhone, encrypt, isReady },
        },
      ],
    }).compile();

    service = module.get(ConversationPersistenceService);
  });

  it('réutilise une conversation active et y ajoute le message chiffré', async () => {
    const conversation = {
      id: 'conv-1',
      businessId: 'biz-1',
      clientPhoneHash: 'hash-221700000000',
      clientPhoneEncrypted: 'enc:221700000000',
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
        clientPhoneHash: 'hash-221700000000',
        status: 'active',
      },
      order: { lastMessageAt: 'DESC' },
    });
    expect(messagesSave).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        role: 'user',
        contentEncrypted: 'enc:Bonjour',
        toolCalls: null,
      }),
    );
    expect(messagesSave).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Bonjour' }),
    );
  });

  it('crée une conversation chiffrée si aucune active', async () => {
    conversationsFindOne.mockResolvedValue(null);
    conversationsSave.mockResolvedValue({
      id: 'conv-new',
      businessId: 'biz-1',
      clientPhoneHash: 'hash-221700000000',
      clientPhoneEncrypted: 'enc:221700000000',
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
        clientPhoneHash: 'hash-221700000000',
        clientPhoneEncrypted: 'enc:221700000000',
        status: 'active',
      }),
    );
    expect(messagesSave).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-new',
        role: 'assistant',
        contentEncrypted: 'enc:Je vous écoute',
      }),
    );
  });

  it('récupère la conversation en cas de course unique', async () => {
    const raced = {
      id: 'conv-raced',
      businessId: 'biz-1',
      clientPhoneHash: 'hash-221700000000',
      status: 'active',
    } as Conversation;

    conversationsFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced);

    const uniqueError = new QueryFailedError('INSERT', [], new Error('dup'));
    (
      uniqueError as QueryFailedError & { driverError: { code: string } }
    ).driverError = { code: '23505' };

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

  it('n’écrit rien si le chiffrement n’est pas prêt (fail closed)', async () => {
    isReady.mockReturnValue(false);

    await service.persistMessage(
      'biz-1',
      '221700000000',
      'user',
      'Bonjour',
    );

    expect(messagesSave).not.toHaveBeenCalled();
    expect(conversationsSave).not.toHaveBeenCalled();
  });
});
