import { parseIncomingTextMessages } from './parse-whatsapp-webhook.util';

const SAMPLE_TEXT_MESSAGE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '221771234567',
              phone_number_id: '123456789012345',
            },
            messages: [
              {
                from: '221779876543',
                id: 'wamid.HBgLMjIxNzc5ODc2NTQzFQIAEhgg',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'Bonjour, je voudrais commander' },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

describe('parseIncomingTextMessages', () => {
  it('extrait phone_number_id, from et texte', () => {
    const rawBody = Buffer.from(JSON.stringify(SAMPLE_TEXT_MESSAGE_PAYLOAD));

    expect(parseIncomingTextMessages(rawBody)).toEqual([
      {
        phoneNumberId: '123456789012345',
        from: '221779876543',
        messageId: 'wamid.HBgLMjIxNzc5ODc2NTQzFQIAEhgg',
        text: 'Bonjour, je voudrais commander',
        timestamp: '1700000000',
      },
    ]);
  });

  it('ignore les messages non texte', () => {
    const payload = structuredClone(SAMPLE_TEXT_MESSAGE_PAYLOAD);
    payload.entry[0].changes[0].value.messages = [
      {
        from: '221779876543',
        id: 'wamid.image',
        timestamp: '1700000000',
        type: 'image',
      },
    ];

    expect(parseIncomingTextMessages(Buffer.from(JSON.stringify(payload)))).toEqual(
      [],
    );
  });

  it('ignore les payloads sans entry.messages', () => {
    expect(
      parseIncomingTextMessages(
        Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' })),
      ),
    ).toEqual([]);
  });

  it('retourne [] si JSON invalide', () => {
    expect(parseIncomingTextMessages(Buffer.from('not-json'))).toEqual([]);
  });

  it('extrait le title d’un button_reply', () => {
    const payload = structuredClone(SAMPLE_TEXT_MESSAGE_PAYLOAD);
    payload.entry[0].changes[0].value.messages = [
      {
        from: '221779876543',
        id: 'wamid.button',
        timestamp: '1700000001',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'delivery_mode_delivery', title: 'Livraison' },
        },
      },
    ];

    expect(parseIncomingTextMessages(Buffer.from(JSON.stringify(payload)))).toEqual([
      {
        phoneNumberId: '123456789012345',
        from: '221779876543',
        messageId: 'wamid.button',
        text: 'Livraison',
        timestamp: '1700000001',
      },
    ]);
  });

  it('extrait le title d’un list_reply', () => {
    const payload = structuredClone(SAMPLE_TEXT_MESSAGE_PAYLOAD);
    payload.entry[0].changes[0].value.messages = [
      {
        from: '221779876543',
        id: 'wamid.list',
        timestamp: '1700000002',
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: { id: 'zone_0_fass', title: 'Fass', description: 'Frais : 1 200 F' },
        },
      },
    ];

    expect(parseIncomingTextMessages(Buffer.from(JSON.stringify(payload)))).toEqual([
      {
        phoneNumberId: '123456789012345',
        from: '221779876543',
        messageId: 'wamid.list',
        text: 'Fass',
        timestamp: '1700000002',
      },
    ]);
  });
});
