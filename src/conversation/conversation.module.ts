import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeModule } from '../claude/claude.module';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { ConversationSessionService } from './conversation-session.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message]), ClaudeModule],
  providers: [ConversationSessionService, ConversationOrchestratorService],
  exports: [
    TypeOrmModule,
    ConversationSessionService,
    ConversationOrchestratorService,
  ],
})
export class ConversationModule {}
