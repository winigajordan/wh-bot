import {
  CLAUDE_MESSAGE_WINDOW,
  hasPendingUserMessages,
  sliceMessagesForClaude,
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
