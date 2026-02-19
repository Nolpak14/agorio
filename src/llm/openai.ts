/**
 * OpenAI LLM Adapter
 *
 * Integrates OpenAI GPT models with function calling support
 * for UCP shopping agent operations.
 */

import OpenAI from 'openai';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  LlmResponse,
} from '../types/index.js';

export interface OpenAIAdapterOptions {
  /** OpenAI API key */
  apiKey: string;
  /** Model name (default: gpt-4o) */
  model?: string;
  /** System prompt for the model */
  systemPrompt?: string;
  /** Temperature (0-2, default: 0.7) */
  temperature?: number;
  /** Maximum tokens to generate (default: 4096) */
  maxTokens?: number;
}

export class OpenAIAdapter implements LlmAdapter {
  private readonly client: OpenAI;
  readonly modelName: string;
  private readonly systemPrompt: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(options: OpenAIAdapterOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.modelName = options.model ?? 'gpt-4o';
    this.systemPrompt = options.systemPrompt ?? this.getDefaultSystemPrompt();
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse> {
    const openaiMessages = this.toOpenAIMessages(messages);
    const openaiTools = tools?.length ? this.toOpenAITools(tools) : undefined;

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      max_tokens: this.maxTokens,
      messages: openaiMessages,
      ...(openaiTools ? { tools: openaiTools } : {}),
      temperature: this.temperature,
    });

    return this.parseResponse(response);
  }

  // ─── Internal helpers ───

  private toOpenAIMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];
    // Prepend system prompt
    result.push({ role: 'system', content: this.systemPrompt });

    // Track tool call IDs: tool name → queue of IDs (for resolving name-based toolCallId)
    const toolIdQueues = new Map<string, string[]>();

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
        continue;
      }

      if (msg.role === 'assistant') {
        const toolCalls = msg.toolCalls?.map(tc => {
          // Track IDs for later resolution
          if (!toolIdQueues.has(tc.name)) {
            toolIdQueues.set(tc.name, []);
          }
          toolIdQueues.get(tc.name)!.push(tc.id);

          return {
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          };
        });

        result.push({
          role: 'assistant',
          content: msg.content || null,
          ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
        });
        continue;
      }

      if (msg.role === 'tool') {
        // Resolve tool_call_id: ShoppingAgent sets toolCallId to tool NAME,
        // but OpenAI requires the actual tool_call id from the assistant response.
        let toolCallId = msg.toolCallId ?? 'unknown';

        const queue = toolIdQueues.get(toolCallId);
        if (queue && queue.length > 0) {
          toolCallId = queue.shift()!;
        }

        result.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: toolCallId,
        });
        continue;
      }
    }

    return result;
  }

  private toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private parseResponse(response: OpenAI.ChatCompletion): LlmResponse {
    const choice = response.choices[0];

    if (!choice) {
      return { content: '', toolCalls: [], finishReason: 'error' };
    }

    const content = choice.message.content ?? '';
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? [])
      .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    let finishReason: LlmResponse['finishReason'];
    switch (choice.finish_reason) {
      case 'stop':
        finishReason = 'stop';
        break;
      case 'tool_calls':
        finishReason = 'tool_calls';
        break;
      case 'length':
        finishReason = 'length';
        break;
      default:
        finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
    }

    return {
      content,
      toolCalls,
      finishReason,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  private getDefaultSystemPrompt(): string {
    return `You are a UCP Shopping Agent — an AI assistant that helps users discover and purchase products from UCP-enabled merchants.

You interact with merchants through the Universal Commerce Protocol (UCP). Your workflow:
1. Discover the merchant by fetching their UCP profile
2. Browse their product catalog
3. Help the user find what they need
4. Complete the checkout process when requested

Always be helpful, transparent about prices, and confirm before completing purchases.
When you have enough information to proceed, use the available tools. When you need clarification, ask the user.`;
  }
}
