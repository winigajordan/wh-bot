import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  buildReceivedAckMessage,
  truncateInteractiveTitle,
  WhatsappClientService,
} from './whatsapp-client.service';

describe('WhatsappClientService', () => {
  let service: WhatsappClientService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappClientService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'whatsapp.accessToken' ? 'test-token' : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(WhatsappClientService);
  });

  it('formate le message de confirmation', () => {
    expect(buildReceivedAckMessage('Chez Fatou')).toBe(
      'Message reçu — Chez Fatou',
    );
  });

  it('appelle la Send API Meta', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    await service.sendTextMessage(
      '123456789',
      '221771234567',
      'Message reçu — Chez Fatou',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/123456789/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '221771234567',
          type: 'text',
          text: { body: 'Message reçu — Chez Fatou' },
        }),
      }),
    );
  });

  it('ne lève pas si la Send API échoue', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"bad request"}',
    });

    await expect(
      service.sendTextMessage('123456789', '221771234567', 'test'),
    ).resolves.toBeUndefined();
  });

  it('appelle read + typing indicator', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    await service.markAsReadWithTyping('123456789', 'wamid.test');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/123456789/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: 'wamid.test',
          typing_indicator: { type: 'text' },
        }),
      }),
    );
  });

  it('ne lève pas si read/typing échoue', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"bad request"}',
    });

    await expect(
      service.markAsReadWithTyping('123456789', 'wamid.test'),
    ).resolves.toBeUndefined();
  });

  it('envoie des boutons interactifs', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await service.sendInteractiveButtons(
      '123456789',
      '221771234567',
      'Choisissez le mode',
      [
        { id: 'delivery_mode_delivery', title: 'Livraison' },
        { id: 'delivery_mode_pickup', title: 'Retrait sur place' },
      ],
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/123456789/messages',
      expect.objectContaining({
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '221771234567',
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Choisissez le mode' },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: { id: 'delivery_mode_delivery', title: 'Livraison' },
                },
                {
                  type: 'reply',
                  reply: { id: 'delivery_mode_pickup', title: 'Retrait sur place' },
                },
              ],
            },
          },
        }),
      }),
    );
  });

  it('tronque les titres de boutons trop longs', () => {
    expect(truncateInteractiveTitle('Titre beaucoup trop long ici', 20)).toBe(
      'Titre beaucoup trop ',
    );
  });

  it('envoie une liste interactive', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await service.sendInteractiveList(
      '123456789',
      '221771234567',
      'Choisissez votre zone',
      'Choisir',
      [{ id: 'zone_0_fass', title: 'Fass', description: 'Frais : 1 200 F' }],
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        type: 'interactive',
        interactive: expect.objectContaining({
          type: 'list',
          body: { text: 'Choisissez votre zone' },
        }),
      }),
    );
  });
});
