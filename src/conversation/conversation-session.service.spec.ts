import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import { ConversationSessionService } from './conversation-session.service';
import { SESSION_TTL_SECONDS } from './session.types';

describe('ConversationSessionService', () => {
  let service: ConversationSessionService;
  const getSession = jest.fn();
  const setSession = jest.fn();

  beforeEach(async () => {
    getSession.mockReset();
    setSession.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationSessionService,
        {
          provide: RedisService,
          useValue: { getSession, setSession },
        },
      ],
    }).compile();

    service = module.get(ConversationSessionService);
  });

  it('crée une session vide et y ajoute le message user', async () => {
    getSession.mockResolvedValue(null);

    const session = await service.appendUserMessage(
      'biz-1',
      '221779876543',
      'Bonjour',
    );

    expect(session.messages).toEqual([{ role: 'user', content: 'Bonjour' }]);
    expect(session.cart).toEqual([]);
    expect(session.delivery_info).toBeNull();
    expect(setSession).toHaveBeenCalledWith(
      'session:biz-1:221779876543',
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Bonjour' }],
      }),
      SESSION_TTL_SECONDS,
    );
  });

  it('append à une session existante et rafraîchit le TTL', async () => {
    getSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Salut' }],
      cart: [],
      delivery_info: null,
      last_activity: '2026-01-01T00:00:00.000Z',
    });

    const session = await service.appendUserMessage(
      'biz-1',
      '221779876543',
      'Je commande',
    );

    expect(session.messages).toEqual([
      { role: 'user', content: 'Salut' },
      { role: 'user', content: 'Je commande' },
    ]);
    expect(setSession).toHaveBeenCalledWith(
      'session:biz-1:221779876543',
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'Salut' },
          { role: 'user', content: 'Je commande' },
        ],
      }),
      SESSION_TTL_SECONDS,
    );
  });

  it('append un message assistant', async () => {
    getSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Salut' }],
      cart: [],
      delivery_info: null,
      last_activity: '2026-01-01T00:00:00.000Z',
    });

    await service.appendAssistantMessage(
      'biz-1',
      '221779876543',
      'Je vous écoute.',
    );

    expect(setSession).toHaveBeenCalledWith(
      'session:biz-1:221779876543',
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'Salut' },
          { role: 'assistant', content: 'Je vous écoute.' },
        ],
      }),
      SESSION_TTL_SECONDS,
    );
  });
});
