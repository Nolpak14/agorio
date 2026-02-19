/**
 * Ollama LLM Adapter
 *
 * Integrates local Ollama models with function calling support
 * via Ollama's OpenAI-compatible API endpoint.
 *
 * Requires Ollama running locally: https://ollama.com
 * No API key needed — runs entirely on your machine.
 */

import OpenAI from 'openai';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  LlmResponse,
  LlmStreamChunk,
} from '../types/index.js';

export interface OllamaAdapterOptions {
  /** Model name (default: llama3.1) */
  model?: string;
  /** Ollama server URL (default: http://localhost:11434/v1) */
  baseUrl?: string;
  /** System prompt for the model */
  systemPrompt?: string;
  /** Temperature (0-2, default: 0.7) */
  temperature?: number;
  /** Maximum tokens to generate (default: 4096) */
  maxTokens?: number;
}

export class OllamaAdapter implements LlmAdapter {
  private readonly client: OpenAI;
  readonly modelName: string;
  private readonly systemPrompt: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(options: OllamaAdapterOptions = {}) {
    this.modelName = options.model ?? 'llama3.1';
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 4096;
    this.systemPrompt = options.systemPrompt ?? this.getDefaultSystemPrompt();

    this.client = new OpenAI({
      baseURL: options.baseUrl ?? 'http://localhost:11434/v1',
      apiKey: 'ollama', // Ollama doesn't require a key but the SDK needs a value
    });
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse> {
    const ollamaMessages = this.toOpenAIMessages(messages);
    const ollamaTools = tools?.length ? this.toOpenAITools(tools) : undefined;

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      max_tokens: this.maxTokens,
      messages: ollamaMessages,
      ...(ollamaTools ? { tools: ollamaTools } : {}),
      temperature: this.temperature,
    });

    return this.parseResponse(response);
  }

  async *chatStream(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<LlmStreamChunk> {
    const ollamaMessages = this.toOpenAIMessages(messages);
    const ollamaTools = tools?.length ? this.toOpenAITools(tools) : undefined;

    const stream = await this.client.chat.completions.create({
      model: this.modelName,
      max_tokens: this.maxTokens,
      messages: ollamaMessages,
      ...(ollamaTools ? { tools: ollamaTools } : {}),
      temperature: this.temperature,
      stream: true,
    });

    let content = '';
    const toolCalls: ToolCall[] = [];
    const toolAccumulators = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta.content) {
        content += delta.content;
        yield { type: 'text_delta', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolAccumulators.has(idx)) {
            toolAccumulators.set(idx, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              args: '',
            });
            yield {
              type: 'tool_call_start',
              toolCallId: tc.id ?? '',
              toolName: tc.function?.name ?? '',
            };
          }
          const acc = toolAccumulators.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) {
            acc.args += tc.function.arguments;
            yield {
              type: 'tool_call_delta',
              toolCallId: acc.id,
              argsDelta: tc.function.arguments,
            };
          }
        }
      }

      if (choice.finish_reason) {
        for (const [, acc] of toolAccumulators) {
          const tc: ToolCall = {
            id: acc.id,
            name: acc.name,
            arguments: acc.args ? JSON.parse(acc.args) : {},
          };
          toolCalls.push(tc);
          yield { type: 'tool_call_complete', toolCall: tc };
        }
        toolAccumulators.clear();
      }
    }

    yield {
      type: 'done',
      response: {
        content,
        toolCalls,
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      },
    };
  }

  // ─── Internal helpers ───

  private toOpenAIMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];
    result.push({ role: 'system', content: this.systemPrompt });

    const toolIdQueues = new Map<string, string[]>();

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
        continue;
      }

      if (msg.role === 'assistant') {
        const toolCalls = msg.toolCalls?.map(tc => {
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
    return `You are a UCP Shopping Agent — an AI assistant that helps users discover and purchase products from UCP-enabled and ACP-enabled merchants.

You interact with merchants through the Universal Commerce Protocol (UCP) and Agentic Commerce Protocol (ACP). Your workflow:
1. Discover the merchant by fetching their UCP profile or connecting via ACP
2. Browse their product catalog
3. Help the user find what they need
4. Complete the checkout process when requested

Always be helpful, transparent about prices, and confirm before completing purchases.
When you have enough information to proceed, use the available tools. When you need clarification, ask the user.`;
  }
}
