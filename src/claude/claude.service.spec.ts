import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService } from './claude.service';

jest.mock('@anthropic-ai/sdk');

const create = jest.fn();

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(async () => {
    create.mockReset();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'anthropic.apiKey') {
                return 'test-key';
              }
              if (key === 'anthropic.model') {
                return 'claude-sonnet-4-6';
              }
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(ClaudeService);
  });

  it('envoie system prompt + messages et retourne le texte', async () => {
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Bonjour, je vous écoute.' }],
    });

    await expect(
      service.generateReply('Tu es un assistant.', [
        { role: 'user', content: 'Salut' },
      ]),
    ).resolves.toBe('Bonjour, je vous écoute.');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        system: 'Tu es un assistant.',
        messages: [{ role: 'user', content: 'Salut' }],
      }),
    );
    expect(create.mock.calls[0][0].tools).toBeUndefined();
  });

  it('passe tools seulement s’ils sont fournis', async () => {
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    });

    const tools = [
      {
        name: 'get_menu',
        description: 'Menu',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    await service.generateReply('prompt', [], tools);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ tools }));
  });

  it('exécute la boucle tools puis retourne le texte final', async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_menu',
            input: { category: 'Plats' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Voici nos plats.' }],
      });

    const executeTool = jest.fn().mockResolvedValue({ categories: [] });

    await expect(
      service.generateReply(
        'prompt',
        [{ role: 'user', content: 'Le menu ?' }],
        [
          {
            name: 'get_menu',
            description: 'Menu',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        executeTool,
      ),
    ).resolves.toBe('Voici nos plats.');

    expect(executeTool).toHaveBeenCalledWith('get_menu', {
      category: 'Plats',
    });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
