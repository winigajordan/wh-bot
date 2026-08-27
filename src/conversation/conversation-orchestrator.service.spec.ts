import { Test, TestingModule } from '@nestjs/testing';
import { Business } from '../businesses/entities/business.entity';
import { ClaudeService } from '../claude/claude.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { ModuleToolRegistryService } from '../module-registry/module-tool-registry.service';
import { ORDERING_TOOLS } from '../restaurant-ordering/tools/ordering.tools';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { ConversationSessionService } from './conversation-session.service';

describe('ConversationOrchestratorService', () => {
  let service: ConversationOrchestratorService;
  const appendUserMessage = jest.fn();
  const getSession = jest.fn();
  const appendAssistantMessage = jest.fn();
  const resolve = jest.fn();
  const generateReply = jest.fn();
  const getToolMaxIterations = jest.fn();
  const buildSystemPrompt = jest.fn();
  const getTools = jest.fn();
  const executeTool = jest.fn();

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
    getToolMaxIterations.mockReset();
    buildSystemPrompt.mockReset();
    getTools.mockReset();
    executeTool.mockReset();

    appendUserMessage.mockResolvedValue(undefined);
    getSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Salut' }],
    });
    buildSystemPrompt.mockReturnValue('prompt resto');
    getTools.mockReturnValue(ORDERING_TOOLS);
    resolve.mockReturnValue({ buildSystemPrompt, getTools });
    generateReply.mockResolvedValue('Bonjour, je vous écoute.');
    getToolMaxIterations.mockReturnValue(5);

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
        {
          provide: ModuleToolRegistryService,
          useValue: { execute: executeTool },
        },
        {
          provide: ClaudeService,
          useValue: { generateReply, getToolMaxIterations },
        },
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
    expect(generateReply).toHaveBeenCalledWith(
      expect.stringContaining('au maximum 5 tours'),
      [{ role: 'user', content: 'Salut' }],
      ORDERING_TOOLS,
      expect.any(Function),
    );
    expect(generateReply.mock.calls[0][0]).toContain('prompt resto');
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      'biz-1',
      '221779876543',
      'Bonjour, je vous écoute.',
      1,
    );
  });

  it('n’envoie à Claude que la fenêtre glissante', async () => {
    const messages = Array.from({ length: 24 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    getSession.mockResolvedValue({ messages });

    await service.processConversation(business, '221779876543');

    const sent = generateReply.mock.calls[0][1] as { content: string }[];
    expect(sent).toHaveLength(19);
    expect(sent[0].content).toBe('m4');
    expect(sent.at(-1)?.content).toBe('m22');
    expect(sent.at(-1)?.role).toBe('user');
  });

  it('processConversation ne ré-append pas le message utilisateur', async () => {
    await service.processConversation(business, '221779876543');

    expect(appendUserMessage).not.toHaveBeenCalled();
    expect(generateReply).toHaveBeenCalled();
  });
});
