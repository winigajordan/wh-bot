import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { BusinessesService } from '../businesses/businesses.service';
import { ConversationSessionService } from '../conversation/conversation-session.service';
import {
  buildReceivedAckMessage,
  WhatsappClientService,
} from '../whatsapp-client/whatsapp-client.service';
import { parseIncomingTextMessages } from './parse-whatsapp-webhook.util';
import { verifyWebhookSignature } from './webhook-signature.util';

function tokensMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly businessesService: BusinessesService,
    private readonly conversationSessionService: ConversationSessionService,
    private readonly whatsappClient: WhatsappClientService,
  ) {}

  @Get('whatsapp')
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.get<string>('whatsapp.verifyToken') ?? '';

    if (
      mode !== 'subscribe' ||
      !token ||
      !challenge ||
      !expected ||
      !tokensMatch(token, expected)
    ) {
      throw new ForbiddenException();
    }

    return challenge;
  }

  @Post('whatsapp')
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ status: 'ok' }> {
    const appSecret = this.config.get<string>('whatsapp.appSecret') ?? '';

    if (!verifyWebhookSignature(req.rawBody, signature, appSecret)) {
      throw new ForbiddenException();
    }

    const messages = parseIncomingTextMessages(req.rawBody!);

    for (const message of messages) {
      const business =
        await this.businessesService.findByWhatsAppPhoneNumberId(
          message.phoneNumberId,
        );

      if (!business) {
        this.logger.warn(
          `Business inconnu pour phone_number_id=${message.phoneNumberId}`,
        );
        continue;
      }

      if (business.status !== 'active') {
        this.logger.warn(
          `Business ${business.id} (${business.name}) ignoré — status=${business.status}`,
        );
        continue;
      }

      await this.conversationSessionService.appendUserMessage(
        business.id,
        message.from,
        message.text,
      );

      await this.whatsappClient.sendTextMessage(
        message.phoneNumberId,
        message.from,
        buildReceivedAckMessage(business.name),
      );

      this.logger.log(
        `Message ${message.messageId} de ${message.from} → business ${business.name} (${business.id})`,
      );
    }

    return { status: 'ok' };
  }
}
