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
      this.config.get<string>('anthropic.model') ?? 'claude-sonnet-4-6';
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
    return 5;
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
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      conversation.push({ role: 'user', content: toolResults });
    }

    this.logger.warn('Boucle tools Claude : limite d’itérations atteinte');
    return this.generateFallbackReplyWithoutTools(systemPrompt, conversation);
  }

  private async generateFallbackReplyWithoutTools(
    systemPrompt: string,
    conversation: AnthropicMessageParam[],
  ): Promise<string> {
    conversation.push({
      role: 'user',
      content: TOOL_LOOP_EXHAUSTED_USER_MESSAGE,
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
  ): Promise<Anthropic.Message> {
    const apiKey = this.config.get<string>('anthropic.apiKey') ?? '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY manquante');
    }

    return this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      ...(tools?.length ? { tools } : {}),
    });
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
}
