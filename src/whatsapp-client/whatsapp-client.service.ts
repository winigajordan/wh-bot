import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  InteractiveButton,
  InteractiveListRow,
  OutboundWhatsappMessage,
} from './interactive-message.types';

const GRAPH_API_VERSION = 'v21.0';
const BUTTON_TITLE_MAX = 20;
const LIST_ROW_TITLE_MAX = 24;
const LIST_ROW_DESCRIPTION_MAX = 72;
const LIST_BUTTON_LABEL_MAX = 20;

export function buildReceivedAckMessage(businessName: string): string {
  return `Message reçu — ${businessName}`;
}

export function truncateInteractiveTitle(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
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
    await this.postMessage(phoneNumberId, to, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendInteractiveButtons(
    phoneNumberId: string,
    to: string,
    bodyText: string,
    buttons: InteractiveButton[],
  ): Promise<void> {
    const normalizedButtons = buttons.slice(0, 3).map((button) => {
      const title = truncateInteractiveTitle(button.title, BUTTON_TITLE_MAX);
      if (title !== button.title) {
        this.logger.warn(
          `Titre bouton tronqué (${button.title.length} > ${BUTTON_TITLE_MAX}) : ${button.title}`,
        );
      }
      return {
        type: 'reply' as const,
        reply: {
          id: button.id,
          title,
        },
      };
    });

    await this.postMessage(phoneNumberId, to, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: { buttons: normalizedButtons },
      },
    });
  }

  async sendInteractiveList(
    phoneNumberId: string,
    to: string,
    bodyText: string,
    buttonLabel: string,
    rows: InteractiveListRow[],
  ): Promise<void> {
    const normalizedButtonLabel = truncateInteractiveTitle(
      buttonLabel,
      LIST_BUTTON_LABEL_MAX,
    );
    if (normalizedButtonLabel !== buttonLabel) {
      this.logger.warn(
        `Libellé liste tronqué (${buttonLabel.length} > ${LIST_BUTTON_LABEL_MAX}) : ${buttonLabel}`,
      );
    }

    const normalizedRows = rows.slice(0, 10).map((row) => {
      const title = truncateInteractiveTitle(row.title, LIST_ROW_TITLE_MAX);
      if (title !== row.title) {
        this.logger.warn(
          `Titre ligne liste tronqué (${row.title.length} > ${LIST_ROW_TITLE_MAX}) : ${row.title}`,
        );
      }

      const description = row.description
        ? truncateInteractiveTitle(row.description, LIST_ROW_DESCRIPTION_MAX)
        : undefined;
      if (
        row.description &&
        description &&
        description !== row.description
      ) {
        this.logger.warn(
          `Description ligne liste tronquée (${row.description.length} > ${LIST_ROW_DESCRIPTION_MAX}) : ${row.description}`,
        );
      }

      return {
        id: row.id,
        title,
        ...(description ? { description } : {}),
      };
    });

    await this.postMessage(phoneNumberId, to, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: normalizedButtonLabel,
          sections: [
            {
              title: 'Zones',
              rows: normalizedRows,
            },
          ],
        },
      },
    });
  }

  async sendOutboundMessage(
    phoneNumberId: string,
    to: string,
    message: OutboundWhatsappMessage,
  ): Promise<void> {
    if (message.type === 'text') {
      await this.sendTextMessage(phoneNumberId, to, message.body);
      return;
    }

    if (message.type === 'buttons') {
      await this.sendInteractiveButtons(
        phoneNumberId,
        to,
        message.bodyText,
        message.buttons,
      );
      return;
    }

    await this.sendInteractiveList(
      phoneNumberId,
      to,
      message.bodyText,
      message.buttonLabel,
      message.rows,
    );
  }

  async markAsReadWithTyping(
    phoneNumberId: string,
    messageId: string,
  ): Promise<void> {
    const accessToken = this.config.get<string>('whatsapp.accessToken') ?? '';

    if (!accessToken) {
      this.logger.error(
        'WHATSAPP_ACCESS_TOKEN manquant — read/typing ignoré',
      );
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
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Read/typing API échec (${response.status}) phone_number_id=${phoneNumberId} message_id=${messageId}: ${errorBody}`,
      );
      return;
    }

    this.logger.log(
      `Read/typing OK message_id=${messageId} via phone_number_id=${phoneNumberId}`,
    );
  }

  private async postMessage(
    phoneNumberId: string,
    to: string,
    payload: Record<string, unknown>,
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
      body: JSON.stringify(payload),
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
