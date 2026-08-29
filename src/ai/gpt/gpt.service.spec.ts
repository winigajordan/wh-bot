import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GptService } from './gpt.service';

jest.mock('openai');

const create = jest.fn();

function configGet(overrides: Record<string, unknown> = {}) {
  return (key: string) => {
    if (key in overrides) {
      return overrides[key];
    }
    if (key === 'openai.apiKey') {
      return 'test-key';
    }
    if (key === 'openai.model') {
      return 'gpt-5.6-terra';
    }
    if (key === 'anthropic.toolMaxIterations') {
      return 5;
    }
    return undefined;
  };
}

function usage(overrides: Record<string, number> = {}) {
  return {
    input_tokens: overrides.input_tokens ?? 10,
    output_tokens: overrides.output_tokens ?? 5,
    total_tokens:
      (overrides.input_tokens ?? 10) + (overrides.output_tokens ?? 5),
    input_tokens_details: {
      cached_tokens: overrides.cached_tokens ?? 0,
      cache_write_tokens: 0,
    },
    output_tokens_details: {
      reasoning_tokens: 0,
    },
  };
}

function textResponse(text: string, id = 'resp_text') {
  return {
    id,
    output_text: text,
    output: [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: usage(),
  };
}

describe('GptService', () => {
  let service: GptService;

  beforeEach(async () => {
    create.mockReset();
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      responses: { create },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GptService,
        {
          provide: ConfigService,
          useValue: { get: configGet() },
        },
      ],
    }).compile();

    service = module.get(GptService);
  });

  it('envoie instructions + messages et retourne le texte', async () => {
    create.mockResolvedValue(textResponse('Bonjour, je vous écoute.'));

    await expect(
      service.generateReply({
        systemPrompt: 'Tu es un assistant.',
        messages: [{ role: 'user', content: 'Salut' }],
      }),
    ).resolves.toBe('Bonjour, je vous écoute.');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-terra',
        instructions: 'Tu es un assistant.',
        input: [{ role: 'user', content: 'Salut' }],
      }),
    );
    expect(create.mock.calls[0][0].tools).toBeUndefined();
  });

  it('passe tools seulement s’ils sont fournis', async () => {
    create.mockResolvedValue(textResponse('ok'));

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

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            type: 'function',
            name: 'get_menu',
            description: 'Menu',
            parameters: { type: 'object', properties: {} },
            strict: false,
          },
        ],
      }),
    );
  });

  it('exécute la boucle tools puis retourne le texte final', async () => {
    create
      .mockResolvedValueOnce({
        id: 'resp_tool',
        output_text: '',
        output: [
          {
            type: 'function_call',
            call_id: 'call_1',
            name: 'get_menu',
            arguments: '{"category":"Plats"}',
          },
        ],
        usage: usage(),
      })
      .mockResolvedValueOnce(textResponse('Voici nos plats.', 'resp_final'));

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
    expect(create.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        previous_response_id: 'resp_tool',
        input: [
          {
            type: 'function_call_output',
            call_id: 'call_1',
            output: JSON.stringify({ categories: [] }),
          },
        ],
      }),
    );
  });

  it('exécute plusieurs function_call en parallèle avant le prochain appel', async () => {
    create
      .mockResolvedValueOnce({
        id: 'resp_parallel',
        output_text: '',
        output: [
          {
            type: 'function_call',
            call_id: 'call_a',
            name: 'get_menu',
            arguments: '{}',
          },
          {
            type: 'function_call',
            call_id: 'call_b',
            name: 'get_cart',
            arguments: '{}',
          },
        ],
        usage: usage(),
      })
      .mockResolvedValueOnce(textResponse('Panier et menu ok.', 'resp_done'));

    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({ categories: [] })
      .mockResolvedValueOnce({ items: [] });

    await expect(
      service.generateReply({
        systemPrompt: 'prompt',
        messages: [{ role: 'user', content: 'Menu et panier' }],
        tools: [
          {
            name: 'get_menu',
            description: 'Menu',
            input_schema: { type: 'object', properties: {} },
          },
          {
            name: 'get_cart',
            description: 'Panier',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        executor: { execute: executeTool },
      }),
    ).resolves.toBe('Panier et menu ok.');

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_a',
        output: JSON.stringify({ categories: [] }),
      },
      {
        type: 'function_call_output',
        call_id: 'call_b',
        output: JSON.stringify({ items: [] }),
      },
    ]);
    expect(create.mock.calls[1][0].previous_response_id).toBe('resp_parallel');
  });

  it('force une réponse texte sans tools quand la limite est atteinte', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GptService,
        {
          provide: ConfigService,
          useValue: {
            get: configGet({ 'anthropic.toolMaxIterations': 1 }),
          },
        },
      ],
    }).compile();

    const limitedService = module.get(GptService);

    create
      .mockResolvedValueOnce({
        id: 'resp_limit',
        output_text: '',
        output: [
          {
            type: 'function_call',
            call_id: 'call_1',
            name: 'get_menu',
            arguments: '{}',
          },
        ],
        usage: usage(),
      })
      .mockResolvedValueOnce({
        id: 'resp_limit_tool',
        output_text: '',
        output: [
          {
            type: 'function_call',
            call_id: 'call_2',
            name: 'get_cart',
            arguments: '{}',
          },
        ],
        usage: usage(),
      })
      .mockResolvedValueOnce(
        textResponse('Voici ce que j’ai pour l’instant, on continue ?'),
      );

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

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2][0].tools).toBeUndefined();
    expect(create.mock.calls[2][0].previous_response_id).toBe(
      'resp_limit_tool',
    );
    expect(create.mock.calls[2][0].input).toEqual([
      {
        role: 'user',
        content: expect.stringContaining(
          'Tu as atteint la limite d’appels d’outils pour cette réponse.',
        ),
      },
    ]);
    expect(create.mock.calls[2][0].input[0].content).toContain(
      'confirm_order n’a PAS réussi',
    );
  });

  it('lève une erreur explicite si OPENAI_API_KEY est absente', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GptService,
        {
          provide: ConfigService,
          useValue: {
            get: configGet({ 'openai.apiKey': '' }),
          },
        },
      ],
    }).compile();

    const noKeyService = module.get(GptService);

    await expect(
      noKeyService.generateReply({
        systemPrompt: 'prompt',
        messages: [{ role: 'user', content: 'Salut' }],
      }),
    ).rejects.toThrow('OPENAI_API_KEY manquante');
  });
});
