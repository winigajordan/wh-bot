import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  buildReceivedAckMessage,
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
});
