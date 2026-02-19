/**
 * Tests for OpenAIAdapter - OpenAI GPT LLM integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from '../src/llm/openai.js';
import type { ChatMessage, ToolDefinition } from '../src/types/index.js';

// Mock the OpenAI SDK
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: { create: mockCreate },
      };
      constructor(_opts?: unknown) {}
    },
  };
});

function makeOpenAIResponse(overrides: {
  content?: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  finish_reason?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'gpt-4o',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: overrides.content ?? 'Hello',
        tool_calls: overrides.tool_calls ?? undefined,
      },
      finish_reason: overrides.finish_reason ?? 'stop',
    }],
    usage: overrides.usage ?? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenAIAdapter({ apiKey: 'test-key' });
  });

  // ─── Constructor ───

  describe('constructor', () => {
    it('should set default model name', () => {
      expect(adapter.modelName).toBe('gpt-4o');
    });

    it('should accept custom model name', () => {
      const custom = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4o-mini' });
      expect(custom.modelName).toBe('gpt-4o-mini');
    });
  });

  // ─── Response Parsing ───

  describe('response parsing', () => {
    it('should parse text-only response', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({
        content: 'The merchant sells electronics.',
        finish_reason: 'stop',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('The merchant sells electronics.');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.finishReason).toBe('stop');
    });

    it('should parse tool_calls response', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({
        content: 'Let me discover that merchant.',
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'discover_merchant',
            arguments: '{"domain":"shop.example.com"}',
          },
        }],
        finish_reason: 'tool_calls',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Discover shop.example.com' }]);

      expect(result.content).toBe('Let me discover that merchant.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'call_abc123',
        name: 'discover_merchant',
        arguments: { domain: 'shop.example.com' },
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('should parse multiple tool calls', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({
        content: null,
        tool_calls: [
          {
            id: 'call_01',
            type: 'function',
            function: { name: 'search_products', arguments: '{"query":"headphones"}' },
          },
          {
            id: 'call_02',
            type: 'function',
            function: { name: 'browse_products', arguments: '{"limit":5}' },
          },
        ],
        finish_reason: 'tool_calls',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Find headphones' }]);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('search_products');
      expect(result.toolCalls[1].name).toBe('browse_products');
    });

    it('should map length finish_reason', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({
        finish_reason: 'length',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
      expect(result.finishReason).toBe('length');
    });

    it('should map usage tokens correctly', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should handle missing choices gracefully', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
      expect(result.finishReason).toBe('error');
      expect(result.content).toBe('');
    });
  });

  // ─── Message Conversion ───

  describe('message conversion', () => {
    it('should prepend system prompt', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      await adapter.chat([{ role: 'user', content: 'Hello' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('UCP Shopping Agent');
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should skip inline system messages', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      await adapter.chat([
        { role: 'system', content: 'Extra system.' },
        { role: 'user', content: 'Hello' },
      ]);

      const callArgs = mockCreate.mock.calls[0][0];
      // System prompt + user message (inline system skipped)
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1].role).toBe('user');
    });

    it('should convert assistant messages with tool calls', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Discover example.com' },
        {
          role: 'assistant',
          content: 'Let me discover that.',
          toolCalls: [{
            id: 'call_abc',
            name: 'discover_merchant',
            arguments: { domain: 'example.com' },
          }],
        },
        {
          role: 'tool',
          content: '{"domain":"example.com"}',
          toolCallId: 'discover_merchant',
        },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      // system + user + assistant + tool
      expect(callArgs.messages).toHaveLength(4);

      const assistantMsg = callArgs.messages[2];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toBe('Let me discover that.');
      expect(assistantMsg.tool_calls).toHaveLength(1);
      expect(assistantMsg.tool_calls[0]).toEqual({
        id: 'call_abc',
        type: 'function',
        function: {
          name: 'discover_merchant',
          arguments: '{"domain":"example.com"}',
        },
      });

      // Tool result should use the actual ID, not the tool name
      const toolMsg = callArgs.messages[3];
      expect(toolMsg.role).toBe('tool');
      expect(toolMsg.tool_call_id).toBe('call_abc');
    });

    it('should resolve name-based toolCallId to actual tool_call_id', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Search' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: 'call_REAL_ID',
            name: 'search_products',
            arguments: { query: 'test' },
          }],
        },
        {
          role: 'tool',
          content: '{"products":[]}',
          toolCallId: 'search_products', // Name, not ID
        },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      const toolMsg = callArgs.messages[3];
      expect(toolMsg.tool_call_id).toBe('call_REAL_ID');
    });

    it('should handle same tool called twice with correct ID resolution', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Add two items' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call_FIRST', name: 'add_to_cart', arguments: { productId: 'a' } },
            { id: 'call_SECOND', name: 'add_to_cart', arguments: { productId: 'b' } },
          ],
        },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'add_to_cart' },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'add_to_cart' },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      // system + user + assistant + tool + tool
      expect(callArgs.messages[3].tool_call_id).toBe('call_FIRST');
      expect(callArgs.messages[4].tool_call_id).toBe('call_SECOND');
    });
  });

  // ─── Tool Definition Conversion ───

  describe('tool definition conversion', () => {
    it('should convert ToolDefinition to OpenAI function tool format', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      const tools: ToolDefinition[] = [{
        name: 'discover_merchant',
        description: 'Discover a UCP merchant by domain',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Merchant domain' },
          },
          required: ['domain'],
        },
      }];

      await adapter.chat([{ role: 'user', content: 'Hi' }], tools);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toHaveLength(1);
      expect(callArgs.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'discover_merchant',
          description: 'Discover a UCP merchant by domain',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Merchant domain' },
            },
            required: ['domain'],
          },
        },
      });
    });

    it('should not pass tools when none provided', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      await adapter.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
    });
  });

  // ─── API Call Parameters ───

  describe('API call parameters', () => {
    it('should pass default parameters', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));

      await adapter.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4o');
      expect(callArgs.max_tokens).toBe(4096);
      expect(callArgs.temperature).toBe(0.7);
    });

    it('should use custom options', async () => {
      const custom = new OpenAIAdapter({
        apiKey: 'test',
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        temperature: 0.3,
      });

      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));
      await custom.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4o-mini');
      expect(callArgs.max_tokens).toBe(1024);
      expect(callArgs.temperature).toBe(0.3);
    });

    it('should use custom system prompt', async () => {
      const custom = new OpenAIAdapter({
        apiKey: 'test',
        systemPrompt: 'You are a test bot.',
      });

      mockCreate.mockResolvedValueOnce(makeOpenAIResponse({}));
      await custom.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are a test bot.' });
    });
  });
});
