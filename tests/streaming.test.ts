/**
 * Tests for streaming support — runStream() with streaming and non-streaming adapters
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  LlmStreamChunk,
  ToolCall,
  AgentStreamEvent,
} from '../src/types/index.js';

/**
 * Non-streaming mock LLM (only implements chat).
 * Used to test runStream() fallback behavior.
 */
class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-mock';
  private callIndex = 0;
  private readonly script: Array<{
    content?: string;
    toolCalls?: ToolCall[];
  }>;

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex++];
    if (!step) {
      return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    }
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
    };
  }
}

/**
 * Streaming mock LLM — implements both chat() and chatStream().
 * chatStream() yields character-by-character text and tool calls with argument deltas.
 */
class ScriptedStreamingLlm implements LlmAdapter {
  readonly modelName = 'scripted-streaming-mock';
  private callIndex = 0;
  private readonly script: Array<{
    content?: string;
    toolCalls?: ToolCall[];
  }>;

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex++];
    if (!step) {
      return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    }
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
    };
  }

  async *chatStream(_messages: ChatMessage[], _tools?: ToolDefinition[]): AsyncGenerator<LlmStreamChunk> {
    const step = this.script[this.callIndex++];
    if (!step) {
      yield { type: 'text_delta', text: 'Done.' };
      yield { type: 'done', response: { content: 'Done.', toolCalls: [], finishReason: 'stop' } };
      return;
    }

    const content = step.content ?? '';
    const toolCalls = step.toolCalls ?? [];

    // Yield text character by character to test accumulation
    for (const char of content) {
      yield { type: 'text_delta', text: char };
    }

    // Yield tool calls with argument deltas
    for (const tc of toolCalls) {
      yield { type: 'tool_call_start', toolCallId: tc.id, toolName: tc.name };
      const argsStr = JSON.stringify(tc.arguments);
      const mid = Math.floor(argsStr.length / 2);
      if (mid > 0) {
        yield { type: 'tool_call_delta', toolCallId: tc.id, argsDelta: argsStr.slice(0, mid) };
        yield { type: 'tool_call_delta', toolCallId: tc.id, argsDelta: argsStr.slice(mid) };
      }
      yield { type: 'tool_call_complete', toolCall: tc };
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
}

/** Collect all events from an async generator */
async function collectEvents(gen: AsyncGenerator<AgentStreamEvent>): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe('Streaming Support', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Streaming Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  describe('runStream() with streaming adapter', () => {
    it('should stream text deltas character by character', async () => {
      const llm = new ScriptedStreamingLlm([
        { content: 'Hello world!' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Say hello'));

      const textDeltas = events.filter(e => e.type === 'text_delta');
      expect(textDeltas).toHaveLength(12); // "Hello world!" = 12 chars
      expect(textDeltas.map(e => e.text).join('')).toBe('Hello world!');

      const doneEvents = events.filter(e => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].result?.success).toBe(true);
      expect(doneEvents[0].result?.answer).toBe('Hello world!');
    });

    it('should emit tool_call and tool_result events', async () => {
      const llm = new ScriptedStreamingLlm([
        {
          content: 'Discovering...',
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Found the merchant.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Discover'));

      const toolCallEvents = events.filter(e => e.type === 'tool_call');
      expect(toolCallEvents).toHaveLength(1);
      expect(toolCallEvents[0].toolName).toBe('discover_merchant');

      const toolResultEvents = events.filter(e => e.type === 'tool_result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0].toolName).toBe('discover_merchant');
      expect(toolResultEvents[0].toolOutput).toBeDefined();
    });

    it('should complete a full shopping flow with streaming', async () => {
      const llm = new ScriptedStreamingLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        {
          toolCalls: [{
            id: 'call_2',
            name: 'browse_products',
            arguments: { limit: 5 },
          }],
        },
        {
          toolCalls: [{
            id: 'call_3',
            name: 'add_to_cart',
            arguments: { productId: 'prod_laptop_stand', quantity: 1 },
          }],
        },
        {
          toolCalls: [{
            id: 'call_4',
            name: 'initiate_checkout',
            arguments: {},
          }],
        },
        {
          toolCalls: [{
            id: 'call_5',
            name: 'submit_shipping',
            arguments: {
              name: 'Test User',
              line1: '123 Main St',
              city: 'San Francisco',
              state: 'CA',
              postalCode: '94105',
              country: 'US',
            },
          }],
        },
        {
          toolCalls: [{
            id: 'call_6',
            name: 'submit_payment',
            arguments: {
              paymentMethod: 'mock_payment',
              paymentToken: 'tok_mock_success',
            },
          }],
        },
        { content: 'Order placed successfully!' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Buy a laptop stand'));

      const toolCallEvents = events.filter(e => e.type === 'tool_call');
      expect(toolCallEvents).toHaveLength(6);
      expect(toolCallEvents.map(e => e.toolName)).toEqual([
        'discover_merchant',
        'browse_products',
        'add_to_cart',
        'initiate_checkout',
        'submit_shipping',
        'submit_payment',
      ]);

      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent?.result?.success).toBe(true);
      expect(doneEvent?.result?.checkout).toBeDefined();
      expect(doneEvent?.result?.checkout?.status).toBe('completed');
    });

    it('should include iteration numbers in events', async () => {
      const llm = new ScriptedStreamingLlm([
        {
          content: 'Step 1',
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Step 2 done.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Discover'));

      // Iteration 1: text deltas + tool call + tool result
      const iter1Events = events.filter(e => e.iteration === 1);
      expect(iter1Events.length).toBeGreaterThan(0);
      expect(iter1Events.some(e => e.type === 'text_delta')).toBe(true);
      expect(iter1Events.some(e => e.type === 'tool_call')).toBe(true);

      // Iteration 2: text deltas + done
      const iter2Events = events.filter(e => e.iteration === 2);
      expect(iter2Events.some(e => e.type === 'text_delta')).toBe(true);
      expect(iter2Events.some(e => e.type === 'done')).toBe(true);
    });

    it('should include timestamps in all events', async () => {
      const llm = new ScriptedStreamingLlm([
        { content: 'Hello.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const before = Date.now();
      const events = await collectEvents(agent.runStream('Hello'));
      const after = Date.now();

      for (const event of events) {
        expect(event.timestamp).toBeGreaterThanOrEqual(before);
        expect(event.timestamp).toBeLessThanOrEqual(after);
      }
    });
  });

  describe('runStream() with non-streaming adapter (fallback)', () => {
    it('should emit full text as a single text_delta', async () => {
      const llm = new ScriptedLlm([
        { content: 'Hello world!' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Say hello'));

      const textDeltas = events.filter(e => e.type === 'text_delta');
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0].text).toBe('Hello world!');

      const doneEvents = events.filter(e => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].result?.success).toBe(true);
    });

    it('should execute tools with non-streaming adapter', async () => {
      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Found it.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Discover'));

      expect(events.some(e => e.type === 'tool_call')).toBe(true);
      expect(events.some(e => e.type === 'tool_result')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);
    });
  });

  describe('runStream() edge cases', () => {
    it('should respect maxIterations and emit done event', async () => {
      const llm = new ScriptedStreamingLlm(
        Array.from({ length: 50 }, (_, i) => ({
          toolCalls: [{
            id: `call_${i}`,
            name: 'browse_products',
            arguments: { page: i + 1 },
          }],
        }))
      );

      const agent = new ShoppingAgent({ llm, maxIterations: 3 });
      const events = await collectEvents(agent.runStream('Browse everything'));

      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.result?.success).toBe(false);
      expect(doneEvent!.result?.answer).toContain('maximum iterations');
      expect(doneEvent!.result?.iterations).toBe(3);
    });

    it('should handle tool errors gracefully in streaming', async () => {
      const llm = new ScriptedStreamingLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'get_product',
            arguments: { productId: 'nonexistent' },
          }],
        },
        { content: 'Product not found.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Get nonexistent'));

      const toolResult = events.find(e => e.type === 'tool_result');
      expect(toolResult).toBeDefined();
      expect(JSON.stringify(toolResult!.toolOutput)).toContain('error');

      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent?.result?.success).toBe(true);
    });

    it('should also record steps (for AgentResult) during streaming', async () => {
      const llm = new ScriptedStreamingLlm([
        {
          content: 'Thinking...',
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Done discovering.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Discover'));

      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent?.result?.steps).toBeDefined();
      expect(doneEvent!.result!.steps.length).toBeGreaterThan(0);
      expect(doneEvent!.result!.steps.some(s => s.type === 'thinking')).toBe(true);
      expect(doneEvent!.result!.steps.some(s => s.type === 'tool_call')).toBe(true);
      expect(doneEvent!.result!.steps.some(s => s.type === 'tool_result')).toBe(true);
    });

    it('should emit error event on adapter failure', async () => {
      const llm: LlmAdapter = {
        modelName: 'error-mock',
        chatStream: async function* () {
          throw new Error('API rate limit exceeded');
        },
        async chat(): Promise<LlmResponse> {
          throw new Error('API rate limit exceeded');
        },
      };

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Test error'));

      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.error).toBe('API rate limit exceeded');
    });

    it('should emit no text_delta when content is empty', async () => {
      const llm = new ScriptedStreamingLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Done.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const events = await collectEvents(agent.runStream('Discover'));

      // First iteration has no content, only tool call
      const iter1TextDeltas = events.filter(e => e.type === 'text_delta' && e.iteration === 1);
      expect(iter1TextDeltas).toHaveLength(0);
    });
  });
});
