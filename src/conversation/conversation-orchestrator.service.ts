import { Injectable, Logger } from '@nestjs/common';
import { Business } from '../businesses/entities/business.entity';
import { ClaudeService } from '../claude/claude.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { ModuleToolRegistryService } from '../module-registry/module-tool-registry.service';
import { ConversationSessionService } from './conversation-session.service';
import { sliceMessagesForClaude } from './session.types';

@Injectable()
export class ConversationOrchestratorService {
  private readonly logger = new Logger(ConversationOrchestratorService.name);

  constructor(
    private readonly sessionService: ConversationSessionService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly moduleToolRegistry: ModuleToolRegistryService,
    private readonly claudeService: ClaudeService,
  ) {}

  async handleIncomingMessage(
    business: Business,
    from: string,
    text: string,
  ): Promise<string> {
    await this.sessionService.appendUserMessage(business.id, from, text);
    return this.processConversation(business, from);
  }

  async processConversation(business: Business, from: string): Promise<string> {
    const session = await this.sessionService.getSession(business.id, from);

    const moduleKey = business.module?.key;
    if (!moduleKey) {
      throw new Error(`Business ${business.id} sans module.key`);
    }

    const moduleDefinition = this.moduleRegistry.resolve(moduleKey);
    const systemPrompt = moduleDefinition.buildSystemPrompt(business);
    const tools = moduleDefinition.getTools();
    const windowedMessages = sliceMessagesForClaude(session.messages);

    this.logger.log(
      `Claude pour business ${business.name} (${business.id}) module=${moduleKey} messages=${windowedMessages.length}/${session.messages.length} tools=${tools.length}`,
    );

    const reply = await this.claudeService.generateReply(
      systemPrompt,
      windowedMessages,
      tools,
      tools.length
        ? (name, input) =>
            this.moduleToolRegistry.execute(moduleKey, name, input, {
              businessId: business.id,
              clientPhone: from,
            })
        : undefined,
    );

    if (reply) {
      await this.sessionService.appendAssistantMessage(business.id, from, reply);
    }

    return reply;
  }
}
