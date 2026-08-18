import { Injectable, Logger } from '@nestjs/common';
import { Business } from '../businesses/entities/business.entity';
import { ClaudeService } from '../claude/claude.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { ConversationSessionService } from './conversation-session.service';

@Injectable()
export class ConversationOrchestratorService {
  private readonly logger = new Logger(ConversationOrchestratorService.name);

  constructor(
    private readonly sessionService: ConversationSessionService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly claudeService: ClaudeService,
  ) {}

  async handleIncomingMessage(
    business: Business,
    from: string,
    text: string,
  ): Promise<string> {
    await this.sessionService.appendUserMessage(business.id, from, text);
    const session = await this.sessionService.getSession(business.id, from);

    const moduleKey = business.module?.key;
    if (!moduleKey) {
      throw new Error(`Business ${business.id} sans module.key`);
    }

    const moduleDefinition = this.moduleRegistry.resolve(moduleKey);
    const systemPrompt = moduleDefinition.buildSystemPrompt(business);

    this.logger.log(
      `Claude pour business ${business.name} (${business.id}) module=${moduleKey}`,
    );

    const reply = await this.claudeService.generateReply(
      systemPrompt,
      session.messages,
    );

    if (reply) {
      await this.sessionService.appendAssistantMessage(business.id, from, reply);
    }

    return reply;
  }
}
