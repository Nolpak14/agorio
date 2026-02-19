/**
 * Claude (Anthropic) LLM Adapter
 *
 * Integrates Anthropic Claude with tool use support
 * for UCP shopping agent operations.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  LlmResponse,
  LlmStreamChunk,
} from '../types/index.js';

export interface ClaudeAdapterOptions {
  /** Anthropic API key */
  apiKey: string;
  /** Model name (default: claude-sonnet-4-20250514) */
  model?: string;
  /** System prompt for the model */
  systemPrompt?: string;
  /** Temperature (0-1, default: 0.7) */
  temperature?: number;
  /** Maximum tokens to generate (default: 4096) */
  maxTokens?: number;
}

export class ClaudeAdapter implements LlmAdapter {
  private readonly client: Anthropic;
  readonly modelName: string;
  private readonly systemPrompt: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(options: ClaudeAdapterOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.modelName = options.model ?? 'claude-sonnet-4-20250514';
    this.systemPrompt = options.systemPrompt ?? this.getDefaultSystemPrompt();
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse> {
    const anthropicMessages = this.toAnthropicMessages(messages);
    const anthropicTools = tools?.length ? this.toAnthropicTools(tools) : undefined;

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: anthropicMessages,
      ...(anthropicTools ? { tools: anthropicTools } : {}),
      temperature: this.temperature,
    });

    return this.parseResponse(response);
  }

  async *chatStream(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<LlmStreamChunk> {
    const anthropicMessages = this.toAnthropicMessages(messages);
    const anthropicTools = tools?.length ? this.toAnthropicTools(tools) : undefined;

    const stream = this.client.messages.stream({
      model: this.modelName,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: anthropicMessages,
      ...(anthropicTools ? { tools: anthropicTools } : {}),
      temperature: this.temperature,
    });

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];
    const toolAccumulators = new Map<number, { id: string; name: string; args: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolAccumulators.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            args: '',
          });
          yield {
            type: 'tool_call_start',
            toolCallId: event.content_block.id,
            toolName: event.content_block.name,
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textParts.push(event.delta.text);
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          const acc = toolAccumulators.get(event.index);
          if (acc) {
            acc.args += event.delta.partial_json;
            yield {
              type: 'tool_call_delta',
              toolCallId: acc.id,
              argsDelta: event.delta.partial_json,
            };
          }
        }
      } else if (event.type === 'content_block_stop') {
        const acc = toolAccumulators.get(event.index);
        if (acc) {
          const tc: ToolCall = {
            id: acc.id,
            name: acc.name,
            arguments: acc.args ? JSON.parse(acc.args) : {},
          };
          toolCalls.push(tc);
          yield { type: 'tool_call_complete', toolCall: tc };
          toolAccumulators.delete(event.index);
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    yield {
      type: 'done',
      response: {
        content: textParts.join(''),
        toolCalls,
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
        usage: {
          promptTokens: finalMessage.usage.input_tokens,
          completionTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        },
      },
    };
  }

  // ─── Internal helpers ───

  private toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];
    // Track tool call IDs: tool name → queue of IDs (for resolving name-based toolCallId)
    const toolIdQueues = new Map<string, string[]>();

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
        continue;
      }

      if (msg.role === 'assistant') {
        const contentBlocks: Anthropic.ContentBlockParam[] = [];

        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
            // Enqueue this ID for later resolution
            if (!toolIdQueues.has(tc.name)) {
              toolIdQueues.set(tc.name, []);
            }
            toolIdQueues.get(tc.name)!.push(tc.id);
          }
        }

        if (contentBlocks.length > 0) {
          result.push({ role: 'assistant', content: contentBlocks });
        }
        continue;
      }

      if (msg.role === 'tool') {
        // Resolve tool_use_id: ShoppingAgent sets toolCallId to tool NAME,
        // but Anthropic requires the actual tool_use block ID.
        let toolUseId = msg.toolCallId ?? 'unknown';

        const queue = toolIdQueues.get(toolUseId);
        if (queue && queue.length > 0) {
          toolUseId = queue.shift()!;
        }

        const toolResultBlock: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: msg.content,
        };

        // Merge consecutive tool results into a single user message
        // (Anthropic requires strict role alternation)
        const last = result[result.length - 1];
        if (last && last.role === 'user' && Array.isArray(last.content)) {
          (last.content as Anthropic.ToolResultBlockParam[]).push(toolResultBlock);
        } else {
          result.push({ role: 'user', content: [toolResultBlock] });
        }
        continue;
      }
    }

    return result;
  }

  private toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: (tool.parameters as Record<string, unknown>).properties ?? {},
        required: ((tool.parameters as Record<string, unknown>).required ?? []) as string[],
      },
    }));
  }

  private parseResponse(response: Anthropic.Message): LlmResponse {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      }
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    let finishReason: LlmResponse['finishReason'];
    switch (response.stop_reason) {
      case 'end_turn':
        finishReason = 'stop';
        break;
      case 'tool_use':
        finishReason = 'tool_calls';
        break;
      case 'max_tokens':
        finishReason = 'length';
        break;
      default:
        finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
    }

    return {
      content: textParts.join(''),
      toolCalls,
      finishReason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
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
