import { Test, TestingModule } from '@nestjs/testing';
import { Business } from '../businesses/entities/business.entity';
import { ClaudeService } from '../claude/claude.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { ConversationSessionService } from './conversation-session.service';

describe('ConversationOrchestratorService', () => {
  let service: ConversationOrchestratorService;
  const appendUserMessage = jest.fn();
  const getSession = jest.fn();
  const appendAssistantMessage = jest.fn();
  const resolve = jest.fn();
  const generateReply = jest.fn();
  const buildSystemPrompt = jest.fn();

  const business = {
    id: 'biz-1',
    name: 'Chez Fatou',
    address: 'Almadies',
    contactPhone: '+221770000001',
    module: { key: 'restaurant_ordering' },
  } as Business;

  beforeEach(async () => {
    appendUserMessage.mockReset();
    getSession.mockReset();
    appendAssistantMessage.mockReset();
    resolve.mockReset();
    generateReply.mockReset();
    buildSystemPrompt.mockReset();

    appendUserMessage.mockResolvedValue(undefined);
    getSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Salut' }],
    });
    buildSystemPrompt.mockReturnValue('prompt resto');
    resolve.mockReturnValue({ buildSystemPrompt });
    generateReply.mockResolvedValue('Bonjour, je vous écoute.');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationOrchestratorService,
        {
          provide: ConversationSessionService,
          useValue: {
            appendUserMessage,
            getSession,
            appendAssistantMessage,
          },
        },
        { provide: ModuleRegistryService, useValue: { resolve } },
        { provide: ClaudeService, useValue: { generateReply } },
      ],
    }).compile();

    service = module.get(ConversationOrchestratorService);
  });

  it('enchaîne session → registre → Claude → append assistant', async () => {
    await expect(
      service.handleIncomingMessage(business, '221779876543', 'Salut'),
    ).resolves.toBe('Bonjour, je vous écoute.');

    expect(appendUserMessage).toHaveBeenCalledWith(
      'biz-1',
      '221779876543',
      'Salut',
    );
    expect(resolve).toHaveBeenCalledWith('restaurant_ordering');
    expect(buildSystemPrompt).toHaveBeenCalledWith(business);
    expect(generateReply).toHaveBeenCalledWith('prompt resto', [
      { role: 'user', content: 'Salut' },
    ]);
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      'biz-1',
      '221779876543',
      'Bonjour, je vous écoute.',
    );
  });

  it('n’envoie à Claude que la fenêtre glissante', async () => {
    const messages = Array.from({ length: 24 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    getSession.mockResolvedValue({ messages });

    await service.handleIncomingMessage(business, '221779876543', 'Salut');

    const sent = generateReply.mock.calls[0][1] as { content: string }[];
    expect(sent).toHaveLength(20);
    expect(sent[0].content).toBe('m4');
    expect(sent.at(-1)?.content).toBe('m23');
  });
});
