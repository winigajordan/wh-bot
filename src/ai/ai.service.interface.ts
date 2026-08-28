export interface AiToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiToolExecutor {
  execute(toolName: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface AiGenerateReplyParams {
  systemPrompt: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  executor?: AiToolExecutor;
}

export interface AiService {
  generateReply(params: AiGenerateReplyParams): Promise<string>;
}
