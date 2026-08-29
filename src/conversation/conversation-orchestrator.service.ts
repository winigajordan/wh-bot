import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER } from '../ai/ai.constants';
import { resolveAiProviderKey } from '../ai/ai.provider';
import type { AiService } from '../ai/ai.service.interface';
import { Business } from '../businesses/entities/business.entity';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { ModuleToolRegistryService } from '../module-registry/module-tool-registry.service';
import type { ConversationProcessResult } from '../whatsapp-client/interactive-message.types';
import {
  formatInteractiveSessionContent,
  toOutboundMessage,
} from '../whatsapp-client/interactive-message.types';
import { sanitizeWhatsappText } from './sanitize-whatsapp-text';
import { ConversationSessionService } from './conversation-session.service';
import {
  sliceMessagesForClaude,
  trimTrailingAssistantMessages,
} from './session.types';

@Injectable()
export class ConversationOrchestratorService {
  private readonly logger = new Logger(ConversationOrchestratorService.name);

  constructor(
    private readonly sessionService: ConversationSessionService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly moduleToolRegistry: ModuleToolRegistryService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly ai: AiService,
  ) {}

  private getToolMaxIterations(): number {
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

  private buildSystemPromptWithToolBudget(basePrompt: string): string {
    const maxIterations = this.getToolMaxIterations();
    return [
      basePrompt,
      `Contrainte outils : au maximum ${maxIterations} tours d’appel d’outils pour produire ta réponse. Si tu n’as plus assez de tours, réponds au client avec les infos déjà obtenues — ne laisse jamais le client sans réponse.`,
    ].join('\n');
  }

  async handleIncomingMessage(
    business: Business,
    from: string,
    text: string,
  ): Promise<ConversationProcessResult> {
    await this.sessionService.appendUserMessage(business.id, from, text);
    return this.processConversation(business, from);
  }

  async processConversation(
    business: Business,
    from: string,
  ): Promise<ConversationProcessResult> {
    const session = await this.sessionService.getSession(business.id, from);
    const processedMessageCount = session.messages.length;

    const moduleKey = business.module?.key;
    if (!moduleKey) {
      throw new Error(`Business ${business.id} sans module.key`);
    }

    const moduleDefinition = this.moduleRegistry.resolve(moduleKey);
    const aiProvider = resolveAiProviderKey(this.config);
    const systemPrompt = this.buildSystemPromptWithToolBudget(
      moduleDefinition.buildSystemPrompt(business, aiProvider),
    );
    const tools = moduleDefinition.getTools();
    const windowedMessages = trimTrailingAssistantMessages(
      sliceMessagesForClaude(session.messages),
    );

    if (
      windowedMessages.length === 0 ||
      windowedMessages[windowedMessages.length - 1]?.role !== 'user'
    ) {
      this.logger.warn(
        `Skip IA — aucun message user à traiter (${business.id}:${from})`,
      );
      return { outbound: null };
    }

    this.logger.log(
      `IA pour business ${business.name} (${business.id}) module=${moduleKey} messages=${windowedMessages.length}/${session.messages.length} tools=${tools.length}`,
    );

    this.moduleToolRegistry.resetTurn(moduleKey);

    const rawReply = await this.ai.generateReply({
      systemPrompt,
      messages: windowedMessages,
      tools,
      executor: tools.length
        ? {
            execute: (name, input) =>
              this.moduleToolRegistry.execute(moduleKey, name, input, {
                businessId: business.id,
                clientPhone: from,
              }),
          }
        : undefined,
    });

    const pendingInteractive =
      this.moduleToolRegistry.consumePendingInteractiveMessage(moduleKey);

    if (pendingInteractive) {
      const sessionContent =
        formatInteractiveSessionContent(pendingInteractive);
      await this.sessionService.appendAssistantMessage(
        business.id,
        from,
        sessionContent,
        processedMessageCount,
      );

      return { outbound: toOutboundMessage(pendingInteractive) };
    }

    const reply = rawReply ? sanitizeWhatsappText(rawReply) : rawReply;

    if (reply) {
      await this.sessionService.appendAssistantMessage(
        business.id,
        from,
        reply,
        processedMessageCount,
      );
    }

    return reply
      ? { outbound: { type: 'text', body: reply } }
      : { outbound: null };
  }
}
