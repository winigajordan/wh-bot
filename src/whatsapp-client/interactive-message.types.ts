export type InteractiveButton = {
  id: string;
  title: string;
};

export type InteractiveListRow = {
  id: string;
  title: string;
  description?: string;
};

export type PendingInteractiveMessage =
  | {
      type: 'buttons';
      bodyText: string;
      buttons: InteractiveButton[];
    }
  | {
      type: 'list';
      bodyText: string;
      buttonLabel: string;
      rows: InteractiveListRow[];
    };

export type OutboundWhatsappMessage =
  | { type: 'text'; body: string }
  | {
      type: 'buttons';
      bodyText: string;
      buttons: InteractiveButton[];
    }
  | {
      type: 'list';
      bodyText: string;
      buttonLabel: string;
      rows: InteractiveListRow[];
    };

export type ConversationProcessResult = {
  outbound: OutboundWhatsappMessage | null;
};

export function formatInteractiveSessionContent(
  payload: PendingInteractiveMessage,
): string {
  if (payload.type === 'buttons') {
    const labels = payload.buttons.map((button) => button.title).join(', ');
    return `${payload.bodyText} (${labels})`;
  }

  const labels = payload.rows.map((row) => row.title).join(', ');
  return `${payload.bodyText} (${labels})`;
}

export function toOutboundMessage(
  payload: PendingInteractiveMessage,
): OutboundWhatsappMessage {
  if (payload.type === 'buttons') {
    return {
      type: 'buttons',
      bodyText: payload.bodyText,
      buttons: payload.buttons,
    };
  }

  return {
    type: 'list',
    bodyText: payload.bodyText,
    buttonLabel: payload.buttonLabel,
    rows: payload.rows,
  };
}
