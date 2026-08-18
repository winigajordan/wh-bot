import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_API_VERSION = 'v21.0';

export function buildReceivedAckMessage(businessName: string): string {
  return `Message reçu — ${businessName}`;
}

@Injectable()
export class WhatsappClientService {
  private readonly logger = new Logger(WhatsappClientService.name);

  constructor(private readonly config: ConfigService) {}

  async sendTextMessage(
    phoneNumberId: string,
    to: string,
    body: string,
  ): Promise<void> {
    const accessToken = this.config.get<string>('whatsapp.accessToken') ?? '';

    if (!accessToken) {
      this.logger.error('WHATSAPP_ACCESS_TOKEN manquant — envoi WhatsApp ignoré');
      return;
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Send API échec (${response.status}) phone_number_id=${phoneNumberId} to=${to}: ${errorBody}`,
      );
      return;
    }

    this.logger.log(
      `Send API OK → ${to} via phone_number_id=${phoneNumberId}`,
    );
  }
}
