import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService } from './claude.service';

jest.mock('@anthropic-ai/sdk');

const create = jest.fn();

function configGet(overrides: Record<string, unknown> = {}) {
  return (key: string) => {
    if (key in overrides) {
      return overrides[key];
    }
    if (key === 'anthropic.apiKey') {
      return 'test-key';
    }
    if (key === 'anthropic.model') {
      return 'claude-sonnet-5';
    }
    if (key === 'anthropic.toolMaxIterations') {
      return 5;
    }
    if (key === 'anthropic.promptCacheEnabled') {
      return false;
    }
    return undefined;
  };
}

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
          useValue: { get: configGet() },
        },
      ],
    }).compile();

    service = module.get(ClaudeService);
  });

  it('envoie system prompt + messages et retourne le texte', async () => {
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Bonjour, je vous écoute.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await expect(
      service.generateReply({
        systemPrompt: 'Tu es un assistant.',
        messages: [{ role: 'user', content: 'Salut' }],
      }),
    ).resolves.toBe('Bonjour, je vous écoute.');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
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
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const tools = [
      {
        name: 'get_menu',
        description: 'Menu',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    await service.generateReply({
      systemPrompt: 'prompt',
      messages: [],
      tools,
    });

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
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Voici nos plats.' }],
        usage: { input_tokens: 20, output_tokens: 8 },
      });

    const executeTool = jest.fn().mockResolvedValue({ categories: [] });

    await expect(
      service.generateReply({
        systemPrompt: 'prompt',
        messages: [{ role: 'user', content: 'Le menu ?' }],
        tools: [
          {
            name: 'get_menu',
            description: 'Menu',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        executor: { execute: executeTool },
      }),
    ).resolves.toBe('Voici nos plats.');

    expect(executeTool).toHaveBeenCalledWith('get_menu', {
      category: 'Plats',
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('force une réponse texte sans tools quand la limite est atteinte', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeService,
        {
          provide: ConfigService,
          useValue: {
            get: configGet({ 'anthropic.toolMaxIterations': 1 }),
          },
        },
      ],
    }).compile();

    const limitedService = module.get(ClaudeService);

    create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_menu',
            input: {},
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'Voici ce que j’ai pour l’instant, on continue ?',
          },
        ],
        usage: { input_tokens: 20, output_tokens: 8 },
      });

    const executeTool = jest.fn().mockResolvedValue({ categories: [] });
    const tools = [
      {
        name: 'get_menu',
        description: 'Menu',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    await expect(
      limitedService.generateReply({
        systemPrompt: 'prompt',
        messages: [{ role: 'user', content: 'Je commande' }],
        tools,
        executor: { execute: executeTool },
      }),
    ).resolves.toBe('Voici ce que j’ai pour l’instant, on continue ?');

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].tools).toBeDefined();
    expect(create.mock.calls[1][0].tools).toBeUndefined();
    expect(create.mock.calls[1][0].messages.at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining(
        'Tu as atteint la limite d’appels d’outils pour cette réponse.',
      ),
    });
    expect(create.mock.calls[1][0].messages.at(-1).content).toContain(
      'confirm_order n’a PAS réussi',
    );
  });

  it('indique au fallback si confirm_order a réussi avant la limite', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeService,
        {
          provide: ConfigService,
          useValue: {
            get: configGet({ 'anthropic.toolMaxIterations': 1 }),
          },
        },
      ],
    }).compile();

    const limitedService = module.get(ClaudeService);

    create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'confirm_order',
            input: { confirmed_by_client: true },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Commande CMD-0009 confirmée.' }],
        usage: { input_tokens: 20, output_tokens: 8 },
      });

    const executeTool = jest.fn().mockResolvedValue({
      success: true,
      order_number: 'CMD-0009',
      total: 5000,
    });

    await expect(
      limitedService.generateReply({
        systemPrompt: 'prompt',
        messages: [{ role: 'user', content: 'Oui confirme' }],
        tools: [
          {
            name: 'confirm_order',
            description: 'Confirm',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        executor: { execute: executeTool },
      }),
    ).resolves.toBe('Commande CMD-0009 confirmée.');

    expect(create.mock.calls[1][0].messages.at(-1).content).toContain(
      'CMD-0009',
    );
    expect(create.mock.calls[1][0].messages.at(-1).content).toContain(
      'EST bien confirmée',
    );
  });

  describe('prompt caching', () => {
    async function serviceWithCache(
      enabled: boolean,
    ): Promise<ClaudeService> {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ClaudeService,
          {
            provide: ConfigService,
            useValue: {
              get: configGet({ 'anthropic.promptCacheEnabled': enabled }),
            },
          },
        ],
      }).compile();
      return module.get(ClaudeService);
    }

    const twoTools = [
      {
        name: 'get_menu',
        description: 'Menu',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'get_order_status',
        description: 'Status',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    it('ajoute cache_control sur system + dernier tool si activé', async () => {
      const cached = await serviceWithCache(true);
      create.mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
        usage: {
          input_tokens: 100,
          output_tokens: 10,
          cache_creation_input_tokens: 80,
          cache_read_input_tokens: 0,
        },
      });

      await cached.generateReply({
        systemPrompt: 'prompt long',
        messages: [],
        tools: twoTools,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [
            {
              type: 'text',
              text: 'prompt long',
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: [
            expect.objectContaining({ name: 'get_menu' }),
            expect.objectContaining({
              name: 'get_order_status',
              cache_control: { type: 'ephemeral' },
            }),
          ],
        }),
      );
      expect(create.mock.calls[0][0].tools[0].cache_control).toBeUndefined();
    });

    it('ne met pas de cache_control si désactivé', async () => {
      const uncached = await serviceWithCache(false);
      create.mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await uncached.generateReply({
        systemPrompt: 'prompt',
        messages: [],
        tools: twoTools,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'prompt',
          tools: twoTools,
        }),
      );
      expect(create.mock.calls[0][0].tools[1].cache_control).toBeUndefined();
    });

    it('n’utilise pas le cache pour extractMenuFromImages', async () => {
      const cached = await serviceWithCache(true);
      create.mockResolvedValue({
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: '{"categories":[]}',
          },
        ],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      await cached.extractMenuFromImages([
        {
          mediaType: 'image/jpeg',
          base64: Buffer.from('fake').toString('base64'),
        },
      ]);

      const call = create.mock.calls[0][0];
      expect(typeof call.system).toBe('string');
      expect(call.tools).toBeUndefined();
    });
  });
});
