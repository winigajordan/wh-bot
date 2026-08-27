import {
  CLAUDE_MESSAGE_WINDOW,
  hasPendingUserMessages,
  hasUserMessagesSince,
  sliceMessagesForClaude,
  trimTrailingAssistantMessages,
  SessionMessage,
} from './session.types';

describe('sliceMessagesForClaude', () => {
  it('garde les N derniers messages', () => {
    const messages: SessionMessage[] = Array.from({ length: 24 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));

    const sliced = sliceMessagesForClaude(messages);

    expect(sliced).toHaveLength(CLAUDE_MESSAGE_WINDOW);
    expect(sliced[0].content).toBe('m4');
    expect(sliced[0].role).toBe('user');
    expect(sliced.at(-1)?.content).toBe('m23');
  });

  it('ne commence pas par un message assistant', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];

    expect(sliceMessagesForClaude(messages, 2)).toEqual([
      { role: 'user', content: 'c' },
    ]);
  });
});

describe('hasPendingUserMessages', () => {
  it('retourne true si des messages user suivent le dernier assistant', () => {
    expect(
      hasPendingUserMessages([
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'nouveau' },
      ]),
    ).toBe(true);
  });

  it('retourne false si le dernier message est assistant', () => {
    expect(
      hasPendingUserMessages([
        { role: 'user', content: 'salut' },
        { role: 'assistant', content: 'ok' },
      ]),
    ).toBe(false);
  });
});

describe('hasUserMessagesSince', () => {
  it('détecte un user arrivé pendant Claude (sous la réponse assistant)', () => {
    expect(
      hasUserMessagesSince(
        [
          { role: 'user', content: 'A' },
          { role: 'user', content: 'B pendant' },
          { role: 'assistant', content: 'réponse à A' },
        ],
        1,
      ),
    ).toBe(true);
  });

  it('retourne false si rien n’est arrivé après le snapshot', () => {
    expect(
      hasUserMessagesSince(
        [
          { role: 'user', content: 'A' },
          { role: 'assistant', content: 'ok' },
        ],
        1,
      ),
    ).toBe(false);
  });
});

describe('trimTrailingAssistantMessages', () => {
  it('enlève les assistants en fin de liste', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'A' },
        { role: 'user', content: 'B' },
        { role: 'assistant', content: 'ok' },
      ]),
    ).toEqual([
      { role: 'user', content: 'A' },
      { role: 'user', content: 'B' },
    ]);
  });

  it('ne modifie pas une liste qui finit par user', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'B' },
    ];
    expect(trimTrailingAssistantMessages(messages)).toBe(messages);
  });
});
