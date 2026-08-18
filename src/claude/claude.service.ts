import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export type ClaudeChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

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

  async generateReply(
    systemPrompt: string,
    messages: ClaudeChatMessage[],
    tools?: Anthropic.Tool[],
  ): Promise<string> {
    const apiKey = this.config.get<string>('anthropic.apiKey') ?? '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY manquante');
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(tools?.length ? { tools } : {}),
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();

    if (!text) {
      this.logger.warn(
        `Réponse Claude vide (stop_reason=${response.stop_reason})`,
      );
    }

    return text;
  }
}
