/**
 * Gemini LLM Adapter
 *
 * Integrates Google Gemini with function calling support
 * for UCP shopping agent operations.
 */

import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type Content,
  type Part,
  type FunctionDeclaration,
  type FunctionCallingMode,
  SchemaType,
} from '@google/generative-ai';

import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  LlmResponse,
} from '../types/index.js';

export interface GeminiAdapterOptions {
  /** Gemini API key */
  apiKey: string;
  /** Model name (default: gemini-2.0-flash) */
  model?: string;
  /** System instruction for the model */
  systemInstruction?: string;
  /** Temperature (0-2, default: 0.7) */
  temperature?: number;
  /** Function calling mode */
  functionCallingMode?: 'AUTO' | 'ANY' | 'NONE';
}

export class GeminiAdapter implements LlmAdapter {
  private readonly client: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  readonly modelName: string;
  private readonly functionCallingMode: FunctionCallingMode;

  constructor(options: GeminiAdapterOptions) {
    this.client = new GoogleGenerativeAI(options.apiKey);
    this.modelName = options.model ?? 'gemini-2.0-flash';
    this.functionCallingMode = (options.functionCallingMode ?? 'AUTO') as FunctionCallingMode;

    this.model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: options.systemInstruction ?? this.getDefaultSystemInstruction(),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
      },
    });
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse> {
    const contents = this.toGeminiContents(messages);
    const geminiTools = tools ? this.toGeminiTools(tools) : undefined;

    const result = await this.model.generateContent({
      contents,
      tools: geminiTools ? [{ functionDeclarations: geminiTools }] : undefined,
      toolConfig: geminiTools
        ? { functionCallingConfig: { mode: this.functionCallingMode } }
        : undefined,
    });

    const response = result.response;
    const candidate = response.candidates?.[0];

    if (!candidate) {
      return {
        content: '',
        toolCalls: [],
        finishReason: 'error',
      };
    }

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        textParts.push(part.text);
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
        });
      }
    }

    const usage = response.usageMetadata;

    return {
      content: textParts.join(''),
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: usage
        ? {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
            totalTokens: usage.totalTokenCount ?? 0,
          }
        : undefined,
    };
  }

  // ─── Internal helpers ───

  private toGeminiContents(messages: ChatMessage[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages are handled via systemInstruction, skip here
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results become function response parts
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: msg.toolCallId ?? 'unknown',
              response: { result: msg.content },
            },
          }],
        });
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: Part[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  private toGeminiTools(tools: ToolDefinition[]): FunctionDeclaration[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: this.convertJsonSchemaToGemini(tool.parameters) as FunctionDeclaration['parameters'],
    }));
  }

  /**
   * Convert JSON Schema to Gemini's schema format.
   */
  private convertJsonSchemaToGemini(schema: Record<string, unknown>): {
    type: SchemaType;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
    description?: string;
  } {
    const type = schema.type as string;
    const result: Record<string, unknown> = {};

    switch (type) {
      case 'object':
        result.type = SchemaType.OBJECT;
        if (schema.properties) {
          const props: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
            props[key] = this.convertJsonSchemaToGemini(value as Record<string, unknown>);
          }
          result.properties = props;
        }
        if (schema.required) {
          result.required = schema.required;
        }
        break;
      case 'array':
        result.type = SchemaType.ARRAY;
        if (schema.items) {
          result.items = this.convertJsonSchemaToGemini(schema.items as Record<string, unknown>);
        }
        break;
      case 'string':
        result.type = SchemaType.STRING;
        break;
      case 'number':
      case 'integer':
        result.type = SchemaType.NUMBER;
        break;
      case 'boolean':
        result.type = SchemaType.BOOLEAN;
        break;
      default:
        result.type = SchemaType.STRING;
    }

    if (schema.description) {
      result.description = schema.description;
    }

    return result as ReturnType<typeof this.convertJsonSchemaToGemini>;
  }

  private getDefaultSystemInstruction(): string {
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
