import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AI_PROVIDER } from './ai.constants';
import { resolveAiProvider } from './ai.provider';
import { ClaudeModule } from './claude/claude.module';
import { ClaudeService } from './claude/claude.service';
import { GptModule } from './gpt/gpt.module';
import { GptService } from './gpt/gpt.service';

@Module({
  imports: [ConfigModule, ClaudeModule, GptModule],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, ClaudeService, GptService],
      useFactory: resolveAiProvider,
    },
  ],
  exports: [AI_PROVIDER, ClaudeModule, GptModule],
})
export class AiModule {}
