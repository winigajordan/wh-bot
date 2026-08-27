import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeToolDefinition } from '../module-registry/module-definition';

export type ClaudeChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AnthropicMessageParam = Anthropic.MessageParam;

const TOOL_LOOP_EXHAUSTED_USER_MESSAGE =
  'Tu as atteint la limite d’appels d’outils pour cette réponse. Réponds maintenant au client en texte avec les informations déjà obtenues. N’utilise plus d’outils.';

const TOOL_LOOP_NO_CONFIRM_GUARD =
  'Important : confirm_order n’a PAS réussi dans ce tour. Interdiction absolue de dire que la commande est confirmée, finalisée, passée ou en cours de livraison. Si le client voulait valider : résume le panier et demande une confirmation explicite pour le prochain message.';

const TOOL_LOOP_CONFIRMED_HINT = (orderNumber: string) =>
  `Important : la commande EST bien confirmée (numéro ${orderNumber}). Mentionne ce numéro clairement au client.`;

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('anthropic.apiKey') ?? '',
    });
    this.model =
      this.config.get<string>('anthropic.model') ?? 'claude-sonnet-5';
  }

  getToolMaxIterations(): number {
    const configured = this.config.get<number>('anthropic.toolMaxIterations');
    if (
      typeof configured === 'number' &&
      Number.isInteger(configured) &&
      configured >= 1
    ) {
      return configured;
    }
    return 8;
  }

  async generateReply(
    systemPrompt: string,
    messages: ClaudeChatMessage[],
    tools?: ClaudeToolDefinition[],
    executeTool?: ToolExecutor,
  ): Promise<string> {
    if (tools?.length && executeTool) {
      return this.generateReplyWithToolLoop(
        systemPrompt,
        messages,
        tools,
        executeTool,
        this.getToolMaxIterations(),
      );
    }

    return this.generateReplyOnce(systemPrompt, messages, tools);
  }

  private async generateReplyWithToolLoop(
    systemPrompt: string,
    messages: ClaudeChatMessage[],
    tools: ClaudeToolDefinition[],
    executeTool: ToolExecutor,
    maxIterations: number,
  ): Promise<string> {
    const anthropicTools = this.toAnthropicTools(tools);
    const conversation: AnthropicMessageParam[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    let confirmedOrderNumber: string | null = null;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.createMessage(
        systemPrompt,
        conversation,
        anthropicTools,
      );

      if (response.stop_reason !== 'tool_use') {
        return this.extractText(response.content);
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      conversation.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
        );
        if (block.name === 'confirm_order') {
          confirmedOrderNumber = this.readConfirmedOrderNumber(result);
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      conversation.push({ role: 'user', content: toolResults });
    }

    this.logger.warn('Boucle tools Claude : limite d’itérations atteinte');
    return this.generateFallbackReplyWithoutTools(
      systemPrompt,
      conversation,
      confirmedOrderNumber,
    );
  }

  private async generateFallbackReplyWithoutTools(
    systemPrompt: string,
    conversation: AnthropicMessageParam[],
    confirmedOrderNumber: string | null,
  ): Promise<string> {
    const guard = confirmedOrderNumber
      ? TOOL_LOOP_CONFIRMED_HINT(confirmedOrderNumber)
      : TOOL_LOOP_NO_CONFIRM_GUARD;

    conversation.push({
      role: 'user',
      content: `${TOOL_LOOP_EXHAUSTED_USER_MESSAGE}\n${guard}`,
    });

    const response = await this.createMessage(systemPrompt, conversation);
    return this.extractText(response.content);
  }

  private async generateReplyOnce(
    systemPrompt: string,
    messages: ClaudeChatMessage[],
    tools?: ClaudeToolDefinition[],
  ): Promise<string> {
    const response = await this.createMessage(
      systemPrompt,
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      tools?.length ? this.toAnthropicTools(tools) : undefined,
    );

    return this.extractText(response.content);
  }

  private async createMessage(
    systemPrompt: string,
    messages: AnthropicMessageParam[],
    tools?: Anthropic.Tool[],
    maxTokens = 1024,
    options: { usePromptCache?: boolean } = {},
  ): Promise<Anthropic.Message> {
    const apiKey = this.config.get<string>('anthropic.apiKey') ?? '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY manquante');
    }

    const useCache = options.usePromptCache !== false;
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: useCache
        ? this.buildCachedSystem(systemPrompt)
        : systemPrompt,
      messages,
      ...(tools?.length
        ? { tools: useCache ? this.buildCachedTools(tools) : tools }
        : {}),
    });

    this.logUsage(response.usage);
    return response;
  }

  private isPromptCacheEnabled(): boolean {
    return this.config.get<boolean>('anthropic.promptCacheEnabled') !== false;
  }

  private buildCachedSystem(
    systemPrompt: string,
  ): string | Anthropic.TextBlockParam[] {
    if (!this.isPromptCacheEnabled()) {
      return systemPrompt;
    }
    return [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  /**
   * Pose cache_control uniquement sur le DERNIER tool.
   * Prérequis : la liste tools doit être dans le même ordre à chaque appel
   * (ORDERING_TOOLS est un tableau littéral figé — ne pas trier/filtrer).
   */
  private buildCachedTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
    if (!this.isPromptCacheEnabled()) {
      return tools;
    }
    return tools.map((tool, index) =>
      index === tools.length - 1
        ? { ...tool, cache_control: { type: 'ephemeral' as const } }
        : tool,
    );
  }

  private logUsage(usage: Anthropic.Usage | undefined): void {
    if (!usage) {
      return;
    }
    const cacheWrite =
      'cache_creation_input_tokens' in usage &&
      typeof usage.cache_creation_input_tokens === 'number'
        ? usage.cache_creation_input_tokens
        : 0;
    const cacheRead =
      'cache_read_input_tokens' in usage &&
      typeof usage.cache_read_input_tokens === 'number'
        ? usage.cache_read_input_tokens
        : 0;
    this.logger.debug(
      `Claude usage in=${usage.input_tokens} out=${usage.output_tokens} ` +
        `cache_write=${cacheWrite} cache_read=${cacheRead}`,
    );
  }

  /**
   * Extraction one-shot (pas de tools) : une ou plusieurs images → JSON menu.
   */
  async extractMenuFromImages(
    images: Array<{
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      base64: string;
    }>,
  ): Promise<{ rawText: string; parsed: unknown }> {
    if (images.length === 0) {
      throw new Error('Au moins une image requise');
    }

    const systemPrompt = [
      'Tu extrais un menu de restaurant depuis une ou plusieurs images (pages du même menu).',
      'Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans texte avant/après.',
      'Schéma exact :',
      '{"categories":[{"name":"string","items":[{"name":"string","price":number,"description":string|null,"variants":[{"name":"string","price":number}],"options":[{"name":"string","required":boolean,"price":number,"choices":[{"name":"string","price":number}]}]}]}]}',
      'Règles :',
      '- fusionne toutes les pages en un seul menu cohérent (pas de doublons de plats)',
      '- price en nombre (XOF), sans symbole ni séparateur de milliers',
      '- description null si absente',
      '- COLONNES DE PRIX (très important) : si un plat a plusieurs prix selon un format (ex. MM/GM, Sandwich/Plat, Perso/Duo), NE GARDE PAS un seul prix.',
      '  → mets price = le prix le plus bas, et variants = [{name, price}] avec TOUTES les colonnes (prix absolus).',
      '  Ex. Pizza Reine MM 5500 / GM 6000 → {"name":"Reine","price":5500,"variants":[{"name":"MM","price":5500},{"name":"GM","price":6000}]}',
      '  Ex. Oriental poulet Sandwich 3500 / Plat 8000 → variants Sandwich + Plat.',
      '- options [] sauf suppléments/extras (fromage, boisson…). Pour une boisson au choix sans écart de prix : choices [{name, price:0}]',
      '- ignore logos, adresses, horaires, promo hors carte',
      '- regroupe les plats par catégories lisibles sur le menu',
    ].join('\n');

    const content: Anthropic.ContentBlockParam[] = [
      ...images.map(
        (image): Anthropic.ImageBlockParam => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.base64,
          },
        }),
      ),
      {
        type: 'text',
        text:
          images.length === 1
            ? 'Extrais le menu complet selon le schéma JSON demandé.'
            : `Extrais le menu complet à partir de ces ${images.length} images (pages), selon le schéma JSON demandé.`,
      },
    ];

    const response = await this.createMessage(
      systemPrompt,
      [{ role: 'user', content }],
      undefined,
      8192,
      { usePromptCache: false },
    );

    const rawText = this.extractText(response.content);
    return {
      rawText,
      parsed: this.parseJsonPayload(rawText),
    };
  }

  /** @deprecated Prefer extractMenuFromImages */
  async extractMenuFromImage(input: {
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    base64: string;
  }): Promise<{ rawText: string; parsed: unknown }> {
    return this.extractMenuFromImages([input]);
  }

  private parseJsonPayload(rawText: string): unknown {
    const trimmed = rawText.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? trimmed).trim();

    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(candidate.slice(start, end + 1)) as unknown;
      }
      throw new Error('Réponse Vision non JSON');
    }
  }

  private toAnthropicTools(tools: ClaudeToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  private extractText(content: Anthropic.ContentBlock[]): string {
    const text = content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();

    if (!text) {
      this.logger.warn('Réponse Claude sans texte');
    }

    return text;
  }

  private readConfirmedOrderNumber(result: unknown): string | null {
    if (!result || typeof result !== 'object') {
      return null;
    }
    const record = result as Record<string, unknown>;
    if (
      record.success === true &&
      typeof record.order_number === 'string' &&
      record.order_number.trim()
    ) {
      return record.order_number.trim();
    }
    return null;
  }
}
