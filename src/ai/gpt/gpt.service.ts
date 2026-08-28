import { Injectable } from '@nestjs/common';
import { GPT_NOT_IMPLEMENTED_MESSAGE } from '../ai.constants';
import type {
  AiGenerateReplyParams,
  AiService,
} from '../ai.service.interface';

@Injectable()
export class GptService implements AiService {
  async generateReply(_params: AiGenerateReplyParams): Promise<string> {
    return GPT_NOT_IMPLEMENTED_MESSAGE;
  }
}
