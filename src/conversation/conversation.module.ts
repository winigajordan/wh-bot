import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { ConversationSessionService } from './conversation-session.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message]), AiModule],
  providers: [ConversationSessionService, ConversationOrchestratorService],
  exports: [
    TypeOrmModule,
    ConversationSessionService,
    ConversationOrchestratorService,
  ],
})
export class ConversationModule {}
