import { Test } from '@nestjs/testing';
import { GPT_NOT_IMPLEMENTED_MESSAGE } from '../ai.constants';
import { GptService } from './gpt.service';

describe('GptService', () => {
  it('retourne le message placeholder sans appeler OpenAI', async () => {
    const module = await Test.createTestingModule({
      providers: [GptService],
    }).compile();

    const service = module.get(GptService);

    await expect(
      service.generateReply({
        systemPrompt: 'prompt',
        messages: [{ role: 'user', content: 'Salut' }],
      }),
    ).resolves.toBe(GPT_NOT_IMPLEMENTED_MESSAGE);
  });
});
