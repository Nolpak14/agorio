/**
 * Tests for ClaudeAdapter - Anthropic Claude LLM integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAdapter } from '../src/llm/claude.js';
import type { ChatMessage, ToolDefinition, ToolCall } from '../src/types/index.js';

// Mock the Anthropic SDK
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor(_opts?: unknown) {}
    },
  };
});

function makeAnthropicResponse(overrides: {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    content: overrides.content ?? [{ type: 'text', text: 'Hello' }],
    stop_reason: overrides.stop_reason ?? 'end_turn',
    usage: overrides.usage ?? { input_tokens: 10, output_tokens: 5 },
  };
}

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClaudeAdapter({ apiKey: 'test-key' });
  });

  // ─── Constructor ───

  describe('constructor', () => {
    it('should set default model name', () => {
      expect(adapter.modelName).toBe('claude-sonnet-4-20250514');
    });

    it('should accept custom model name', () => {
      const custom = new ClaudeAdapter({ apiKey: 'test', model: 'claude-opus-4-20250514' });
      expect(custom.modelName).toBe('claude-opus-4-20250514');
    });
  });

  // ─── Response Parsing ───

  describe('response parsing', () => {
    it('should parse text-only response', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({
        content: [{ type: 'text', text: 'The merchant sells electronics.' }],
        stop_reason: 'end_turn',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('The merchant sells electronics.');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.finishReason).toBe('stop');
    });

    it('should parse tool_use response', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({
        content: [
          { type: 'text', text: 'Let me discover that merchant.' },
          {
            type: 'tool_use',
            id: 'toolu_01ABC',
            name: 'discover_merchant',
            input: { domain: 'shop.example.com' },
          },
        ],
        stop_reason: 'tool_use',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Discover shop.example.com' }]);

      expect(result.content).toBe('Let me discover that merchant.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'toolu_01ABC',
        name: 'discover_merchant',
        arguments: { domain: 'shop.example.com' },
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('should parse multiple tool calls', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'search_products',
            input: { query: 'headphones' },
          },
          {
            type: 'tool_use',
            id: 'toolu_02',
            name: 'browse_products',
            input: { limit: 5 },
          },
        ],
        stop_reason: 'tool_use',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Find headphones' }]);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('search_products');
      expect(result.toolCalls[1].name).toBe('browse_products');
    });

    it('should map max_tokens stop reason to length', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({
        stop_reason: 'max_tokens',
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);
      expect(result.finishReason).toBe('length');
    });

    it('should map usage tokens correctly', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({
        usage: { input_tokens: 100, output_tokens: 50 },
      }));

      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });
  });

  // ─── Message Conversion ───

  describe('message conversion', () => {
    it('should skip system messages', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      await adapter.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ]);

      const callArgs = mockCreate.mock.calls[0][0];
      // System message goes to system param, not messages
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
    });

    it('should pass system prompt as top-level parameter', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      await adapter.chat([{ role: 'user', content: 'Hello' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(callArgs.system).toContain('UCP Shopping Agent');
    });

    it('should convert assistant messages with tool calls', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Discover example.com' },
        {
          role: 'assistant',
          content: 'Let me discover that.',
          toolCalls: [{
            id: 'toolu_01ABC',
            name: 'discover_merchant',
            arguments: { domain: 'example.com' },
          }],
        },
        {
          role: 'tool',
          content: '{"domain":"example.com"}',
          toolCallId: 'discover_merchant',
        },
        { role: 'user', content: 'What did you find?' },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      // Should be: user, assistant (with tool_use), user (with tool_result), user
      expect(callArgs.messages).toHaveLength(4);

      // Assistant message should have text + tool_use blocks
      const assistantMsg = callArgs.messages[1];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toHaveLength(2);
      expect(assistantMsg.content[0]).toEqual({ type: 'text', text: 'Let me discover that.' });
      expect(assistantMsg.content[1]).toMatchObject({
        type: 'tool_use',
        id: 'toolu_01ABC',
        name: 'discover_merchant',
      });

      // Tool result should use the actual ID, not the tool name
      const toolResultMsg = callArgs.messages[2];
      expect(toolResultMsg.role).toBe('user');
      expect(toolResultMsg.content[0]).toMatchObject({
        type: 'tool_result',
        tool_use_id: 'toolu_01ABC',
      });
    });

    it('should resolve name-based toolCallId to actual tool_use_id', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Search' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: 'toolu_REAL_ID',
            name: 'search_products',
            arguments: { query: 'test' },
          }],
        },
        {
          role: 'tool',
          content: '{"products":[]}',
          toolCallId: 'search_products', // Name, not ID — this is what ShoppingAgent does
        },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      const toolResultMsg = callArgs.messages[2];
      expect(toolResultMsg.content[0].tool_use_id).toBe('toolu_REAL_ID');
    });

    it('should merge consecutive tool results into one user message', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Do stuff' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'toolu_01', name: 'search_products', arguments: { query: 'a' } },
            { id: 'toolu_02', name: 'browse_products', arguments: { limit: 5 } },
          ],
        },
        { role: 'tool', content: '{"result":"a"}', toolCallId: 'search_products' },
        { role: 'tool', content: '{"result":"b"}', toolCallId: 'browse_products' },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      // user, assistant, user (merged tool results)
      expect(callArgs.messages).toHaveLength(3);

      const mergedMsg = callArgs.messages[2];
      expect(mergedMsg.role).toBe('user');
      expect(mergedMsg.content).toHaveLength(2);
      expect(mergedMsg.content[0].tool_use_id).toBe('toolu_01');
      expect(mergedMsg.content[1].tool_use_id).toBe('toolu_02');
    });

    it('should handle same tool called twice with correct ID resolution', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Add two items' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'toolu_FIRST', name: 'add_to_cart', arguments: { productId: 'a' } },
            { id: 'toolu_SECOND', name: 'add_to_cart', arguments: { productId: 'b' } },
          ],
        },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'add_to_cart' },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'add_to_cart' },
      ];

      await adapter.chat(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      const mergedMsg = callArgs.messages[2];
      // First add_to_cart result should get FIRST id, second should get SECOND id
      expect(mergedMsg.content[0].tool_use_id).toBe('toolu_FIRST');
      expect(mergedMsg.content[1].tool_use_id).toBe('toolu_SECOND');
    });
  });

  // ─── Tool Definition Conversion ───

  describe('tool definition conversion', () => {
    it('should convert ToolDefinition to Anthropic Tool format', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

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
        name: 'discover_merchant',
        description: 'Discover a UCP merchant by domain',
        input_schema: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Merchant domain' },
          },
          required: ['domain'],
        },
      });
    });

    it('should not pass tools when none provided', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      await adapter.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
    });
  });

  // ─── API Call Parameters ───

  describe('API call parameters', () => {
    it('should pass default parameters', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));

      await adapter.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
      expect(callArgs.max_tokens).toBe(4096);
      expect(callArgs.temperature).toBe(0.7);
    });

    it('should use custom options', async () => {
      const custom = new ClaudeAdapter({
        apiKey: 'test',
        model: 'claude-haiku-4-20250414',
        maxTokens: 1024,
        temperature: 0.3,
      });

      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));
      await custom.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-haiku-4-20250414');
      expect(callArgs.max_tokens).toBe(1024);
      expect(callArgs.temperature).toBe(0.3);
    });

    it('should use custom system prompt', async () => {
      const custom = new ClaudeAdapter({
        apiKey: 'test',
        systemPrompt: 'You are a test bot.',
      });

      mockCreate.mockResolvedValueOnce(makeAnthropicResponse({}));
      await custom.chat([{ role: 'user', content: 'Hi' }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a test bot.');
    });
  });
});
