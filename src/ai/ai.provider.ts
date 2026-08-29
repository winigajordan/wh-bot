import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from './ai.constants';
import type { AiService } from './ai.service.interface';
import { ClaudeService } from './claude/claude.service';
import { GptService } from './gpt/gpt.service';

const logger = new Logger('AiModule');

export function resolveAiProviderKey(config: ConfigService): AiProvider {
  const raw = (config.get<string>('ai.provider') ?? 'claude')
    .trim()
    .toLowerCase();

  if (raw === 'openai' || raw === 'gpt') {
    return 'openai';
  }

  return 'claude';
}

export function resolveAiProvider(
  config: ConfigService,
  claude: ClaudeService,
  gpt: GptService,
): AiService {
  const raw = (config.get<string>('ai.provider') ?? 'claude')
    .trim()
    .toLowerCase();

  if (resolveAiProviderKey(config) === 'openai') {
    return gpt;
  }

  if (raw !== 'claude') {
    logger.warn(
      `AI_PROVIDER="${raw}" inconnu — fallback sur claude (valeurs : claude | openai)`,
    );
  }

  return claude;
}
