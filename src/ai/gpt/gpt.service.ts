import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  FunctionTool,
  Response,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseUsage,
} from 'openai/resources/responses/responses';
import type {
  AiGenerateReplyParams,
  AiMessage,
  AiService,
  AiToolDefinition,
} from '../ai.service.interface';

const TOOL_LOOP_EXHAUSTED_USER_MESSAGE =
  'Tu as atteint la limite d’appels d’outils pour cette réponse. Réponds maintenant au client en texte avec les informations déjà obtenues. N’utilise plus d’outils.';

const TOOL_LOOP_NO_CONFIRM_GUARD =
  'Important : confirm_order n’a PAS réussi dans ce tour. Interdiction absolue de dire que la commande est confirmée, finalisée, passée ou en cours de livraison. Si le client voulait valider : résume le panier et demande une confirmation explicite pour le prochain message.';

const TOOL_LOOP_CONFIRMED_HINT = (orderNumber: string) =>
  `Important : la commande EST bien confirmée (numéro ${orderNumber}). Mentionne ce numéro clairement au client.`;

type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

@Injectable()
export class GptService implements AiService {
  private readonly logger = new Logger(GptService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>('openai.apiKey') ?? '',
    });
    this.model =
      this.config.get<string>('openai.model') ?? 'gpt-5.6-terra';
  }

  getToolMaxIterations(): number {
    const configured = this.config.get<number>('anthropic.toolMaxIterations');
    if (
      typeof configured === 'number' &&
      Number.isInteger(configured) &&
      configured >= 1
    ) {
      return configured;
    }
    return 8;
  }

  async generateReply(params: AiGenerateReplyParams): Promise<string> {
    const { systemPrompt, messages, tools, executor } = params;
    const executeTool: ToolExecutor | undefined = executor
      ? (name, input) => executor.execute(name, input)
      : undefined;

    if (tools?.length && executeTool) {
      return this.generateReplyWithToolLoop(
        systemPrompt,
        messages,
        tools,
        executeTool,
        this.getToolMaxIterations(),
      );
    }

    const response = await this.createResponse({
      instructions: systemPrompt,
      input: this.toOpenAiInput(messages),
      tools: tools?.length ? this.toOpenAiTools(tools) : undefined,
    });

    return this.extractText(response);
  }

  private async generateReplyWithToolLoop(
    systemPrompt: string,
    messages: AiMessage[],
    tools: AiToolDefinition[],
    executeTool: ToolExecutor,
    maxIterations: number,
  ): Promise<string> {
    const openAiTools = this.toOpenAiTools(tools);
    let confirmedOrderNumber: string | null = null;

    let response = await this.createResponse({
      instructions: systemPrompt,
      input: this.toOpenAiInput(messages),
      tools: openAiTools,
    });

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const functionCalls = this.getFunctionCalls(response);
      if (functionCalls.length === 0) {
        return this.extractText(response);
      }

      const outputs: ResponseInputItem.FunctionCallOutput[] = [];
      for (const call of functionCalls) {
        const parsedArgs = this.parseFunctionArguments(call.arguments);
        const result = await executeTool(call.name, parsedArgs);
        if (call.name === 'confirm_order') {
          confirmedOrderNumber = this.readConfirmedOrderNumber(result);
        }
        outputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      }

      response = await this.createResponse({
        previous_response_id: response.id,
        input: outputs,
        tools: openAiTools,
      });
    }

    this.logger.warn('Boucle tools GPT : limite d’itérations atteinte');
    return this.generateFallbackReplyWithoutTools(
      systemPrompt,
      response.id,
      confirmedOrderNumber,
    );
  }

  private async generateFallbackReplyWithoutTools(
    systemPrompt: string,
    previousResponseId: string,
    confirmedOrderNumber: string | null,
  ): Promise<string> {
    const guard = confirmedOrderNumber
      ? TOOL_LOOP_CONFIRMED_HINT(confirmedOrderNumber)
      : TOOL_LOOP_NO_CONFIRM_GUARD;

    const response = await this.createResponse({
      instructions: systemPrompt,
      previous_response_id: previousResponseId,
      input: [
        {
          role: 'user',
          content: `${TOOL_LOOP_EXHAUSTED_USER_MESSAGE}\n${guard}`,
        },
      ],
    });

    return this.extractText(response);
  }

  private async createResponse(
    params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  ): Promise<Response> {
    const apiKey = this.config.get<string>('openai.apiKey') ?? '';
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY manquante');
    }

    const response = await this.client.responses.create({
      model: this.model,
      ...params,
    });

    this.logUsage(response.usage);
    return response;
  }

  private toOpenAiTools(tools: AiToolDefinition[]): FunctionTool[] {
    return tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
      strict: false,
    }));
  }

  private toOpenAiInput(
    messages: AiMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private getFunctionCalls(response: Response): ResponseFunctionToolCall[] {
    return response.output.filter(
      (item): item is ResponseFunctionToolCall => item.type === 'function_call',
    );
  }

  private parseFunctionArguments(
    argumentsJson: string,
  ): Record<string, unknown> {
    if (!argumentsJson.trim()) {
      return {};
    }
    return JSON.parse(argumentsJson) as Record<string, unknown>;
  }

  private extractText(response: Response): string {
    const fromOutputText = response.output_text?.trim();
    if (fromOutputText) {
      return fromOutputText;
    }

    const text = response.output
      .flatMap((item) => {
        if (item.type !== 'message') {
          return [];
        }
        return item.content
          .filter((block) => block.type === 'output_text')
          .map((block) => block.text);
      })
      .join('\n')
      .trim();

    if (!text) {
      this.logger.warn('Réponse GPT sans texte');
    }

    return text;
  }

  private logUsage(usage: ResponseUsage | undefined): void {
    if (!usage) {
      return;
    }

    const cached = usage.input_tokens_details?.cached_tokens ?? 0;
    this.logger.debug(
      `GPT usage in=${usage.input_tokens} out=${usage.output_tokens} cached=${cached}`,
    );
  }

  private readConfirmedOrderNumber(result: unknown): string | null {
    if (!result || typeof result !== 'object') {
      return null;
    }
    const record = result as Record<string, unknown>;
    if (
      record.success === true &&
      typeof record.order_number === 'string' &&
      record.order_number.trim()
    ) {
      return record.order_number.trim();
    }
    return null;
  }
}
