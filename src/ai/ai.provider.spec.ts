import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAiProvider } from './ai.provider';
import { ClaudeService } from './claude/claude.service';
import { GptService } from './gpt/gpt.service';

describe('resolveAiProvider', () => {
  const claude = { name: 'claude' } as unknown as ClaudeService;
  const gpt = { name: 'gpt' } as unknown as GptService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function configWith(provider: string | undefined): ConfigService {
    return {
      get: (key: string) =>
        key === 'ai.provider' ? provider : undefined,
    } as ConfigService;
  }

  it('retourne ClaudeService pour claude', () => {
    expect(resolveAiProvider(configWith('claude'), claude, gpt)).toBe(claude);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('retourne GptService pour openai', () => {
    expect(resolveAiProvider(configWith('openai'), claude, gpt)).toBe(gpt);
  });

  it('retourne GptService pour l’alias gpt', () => {
    expect(resolveAiProvider(configWith('gpt'), claude, gpt)).toBe(gpt);
  });

  it('fallback Claude + warning si valeur inconnue', () => {
    expect(resolveAiProvider(configWith('mistral'), claude, gpt)).toBe(claude);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fallback Claude si absent', () => {
    expect(resolveAiProvider(configWith(undefined), claude, gpt)).toBe(claude);
  });
});
