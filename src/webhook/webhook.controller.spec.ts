import { ForbiddenException, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { BusinessesService } from '../businesses/businesses.service';
import { Business } from '../businesses/entities/business.entity';
import { ConversationDebounceService } from '../conversation-queue/conversation-debounce.service';
import { ConversationSessionService } from '../conversation/conversation-session.service';
import { WebhookController } from './webhook.controller';
import { computeWebhookSignature } from './webhook-signature.util';

describe('WebhookController', () => {
  let controller: WebhookController;
  const appSecret = 'test-app-secret';
  const findByWhatsAppPhoneNumberId = jest.fn();
  const appendUserMessage = jest.fn();
  const scheduleProcessing = jest.fn();

  beforeEach(async () => {
    findByWhatsAppPhoneNumberId.mockReset();
    appendUserMessage.mockReset();
    scheduleProcessing.mockReset();
    appendUserMessage.mockResolvedValue(undefined);
    scheduleProcessing.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'whatsapp.verifyToken') {
                return 'mon-verify-token';
              }
              if (key === 'whatsapp.appSecret') {
                return appSecret;
              }
              return undefined;
            },
          },
        },
        {
          provide: BusinessesService,
          useValue: { findByWhatsAppPhoneNumberId },
        },
        {
          provide: ConversationSessionService,
          useValue: { appendUserMessage },
        },
        {
          provide: ConversationDebounceService,
          useValue: { scheduleProcessing },
        },
      ],
    }).compile();

    controller = module.get(WebhookController);
  });

  describe('GET verify', () => {
    it('retourne hub.challenge si le token correspond', () => {
      expect(
        controller.verify('subscribe', 'mon-verify-token', '123456'),
      ).toBe('123456');
    });

    it('refuse un mauvais token', () => {
      expect(() =>
        controller.verify('subscribe', 'mauvais', '123456'),
      ).toThrow(ForbiddenException);
    });

    it('refuse un mode autre que subscribe', () => {
      expect(() =>
        controller.verify('unsubscribe', 'mon-verify-token', '123456'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('POST receive', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');

    it('accepte une signature HMAC valide', async () => {
      const signature = computeWebhookSignature(rawBody, appSecret);

      await expect(
        controller.receive({ rawBody } as RawBodyRequest<Request>, signature),
      ).resolves.toEqual({ status: 'ok' });
    });

    it('append le message et programme le debounce pour un business actif', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'test_phone_number_id_fatou' },
                  messages: [
                    {
                      from: '221779876543',
                      id: 'wamid.test',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Salut' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };
      const body = Buffer.from(JSON.stringify(payload));
      const signature = computeWebhookSignature(body, appSecret);
      findByWhatsAppPhoneNumberId.mockResolvedValue({
        id: 'biz-fatou',
        name: 'Chez Fatou',
        status: 'active',
      } as Business);

      await expect(
        controller.receive({ rawBody: body } as RawBodyRequest<Request>, signature),
      ).resolves.toEqual({ status: 'ok' });

      expect(findByWhatsAppPhoneNumberId).toHaveBeenCalledWith(
        'test_phone_number_id_fatou',
      );
      expect(appendUserMessage).toHaveBeenCalledWith(
        'biz-fatou',
        '221779876543',
        'Salut',
      );
      expect(scheduleProcessing).toHaveBeenCalledWith({
        businessId: 'biz-fatou',
        clientPhone: '221779876543',
        phoneNumberId: 'test_phone_number_id_fatou',
      });
    });

    it('retourne ok même si le business est inconnu', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'unknown' },
                  messages: [
                    {
                      from: '221779876543',
                      id: 'wamid.test',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Salut' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };
      const body = Buffer.from(JSON.stringify(payload));
      const signature = computeWebhookSignature(body, appSecret);
      findByWhatsAppPhoneNumberId.mockResolvedValue(null);

      await expect(
        controller.receive({ rawBody: body } as RawBodyRequest<Request>, signature),
      ).resolves.toEqual({ status: 'ok' });
    });

    it('refuse une signature invalide', async () => {
      await expect(
        controller.receive(
          { rawBody } as RawBodyRequest<Request>,
          'sha256=invalid',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuse sans rawBody', async () => {
      await expect(
        controller.receive(
          {} as RawBodyRequest<Request>,
          computeWebhookSignature(rawBody, appSecret),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
