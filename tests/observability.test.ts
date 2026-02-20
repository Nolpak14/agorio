/**
 * Tests for agent observability — structured logging, tracing, token tracking, and latency metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  ToolCall,
  AgentLogEvent,
  AgentSpan,
  AgentTracer,
  AgentUsageSummary,
} from '../src/types/index.js';

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-mock';
  private callIndex = 0;
  private readonly script: Array<{
    content?: string;
    toolCalls?: ToolCall[];
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>;

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex];
    this.callIndex++;

    if (!step) {
      return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    }

    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
      usage: step.usage,
    };
  }
}

class MockTracer implements AgentTracer {
  public spans: Array<{ name: string; attributes?: Record<string, string | number | boolean>; ended: boolean }> = [];

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): AgentSpan {
    const span = { name, attributes, ended: false };
    this.spans.push(span);
    return {
      name,
      attributes,
      end() { span.ended = true; },
    };
  }
}

describe('Observability', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Observability Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  describe('Usage summary in AgentResult', () => {
    it('should include usage summary with token counts', async () => {
      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        },
        {
          toolCalls: [{
            id: 'call_2',
            name: 'browse_products',
            arguments: { limit: 5 },
          }],
          usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
        },
        {
          content: 'Found products.',
          usage: { promptTokens: 300, completionTokens: 30, totalTokens: 330 },
        },
      ]);

      const agent = new ShoppingAgent({ llm });
      const result = await agent.run(`Browse products on ${merchant.domain}`);

      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBe(600);       // 100 + 200 + 300
      expect(result.usage!.completionTokens).toBe(160);   // 50 + 80 + 30
      expect(result.usage!.totalTokens).toBe(760);
      expect(result.usage!.llmCalls).toBe(3);
    });

    it('should track tool call counts and latency', async () => {
      const llm = new ScriptedLlm([
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
            name: 'search_products',
            arguments: { query: 'keyboard' },
          }],
        },
        { content: 'Done.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const result = await agent.run(`Find products on ${merchant.domain}`);

      expect(result.usage).toBeDefined();
      expect(result.usage!.toolCalls).toBe(3);
      expect(result.usage!.toolCallLatency['discover_merchant']).toHaveLength(1);
      expect(result.usage!.toolCallLatency['browse_products']).toHaveLength(1);
      expect(result.usage!.toolCallLatency['search_products']).toHaveLength(1);
      // Each latency should be a non-negative number
      for (const latencies of Object.values(result.usage!.toolCallLatency)) {
        for (const ms of latencies) {
          expect(ms).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should track total latency', async () => {
      const llm = new ScriptedLlm([
        { content: 'Quick response.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const result = await agent.run('Hello');

      expect(result.usage).toBeDefined();
      expect(result.usage!.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.usage!.totalLatencyMs).toBeLessThan(5000); // sanity check
    });

    it('should handle zero token usage gracefully', async () => {
      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
          // no usage field
        },
        { content: 'Done.' },
      ]);

      const agent = new ShoppingAgent({ llm });
      const result = await agent.run('Discover');

      expect(result.usage).toBeDefined();
      expect(result.usage!.totalTokens).toBe(0);
      expect(result.usage!.llmCalls).toBe(2);
      expect(result.usage!.toolCalls).toBe(1);
    });
  });

  describe('Structured logging', () => {
    it('should emit log events via onLog callback', async () => {
      const logs: AgentLogEvent[] = [];

      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        },
        { content: 'Done.' },
      ]);

      const agent = new ShoppingAgent({
        llm,
        onLog: (event) => logs.push(event),
      });

      await agent.run(`Discover ${merchant.domain}`);

      // Should have: run started, llm call debug, tool debug, llm call debug, run completed
      expect(logs.length).toBeGreaterThan(0);

      // Check run started
      const startLog = logs.find(l => l.message === 'Agent run started');
      expect(startLog).toBeDefined();
      expect(startLog!.level).toBe('info');
      expect(startLog!.data?.task).toBeDefined();

      // Check run completed
      const endLog = logs.find(l => l.message === 'Agent run completed');
      expect(endLog).toBeDefined();
      expect(endLog!.level).toBe('info');
      expect(endLog!.data?.success).toBe(true);

      // Check LLM call logs
      const llmLogs = logs.filter(l => l.message === 'LLM call completed');
      expect(llmLogs.length).toBe(2);
      expect(llmLogs[0].data?.promptTokens).toBe(50);

      // Check tool logs
      const toolLogs = logs.filter(l => l.message.includes('completed') && l.message.includes('discover_merchant'));
      expect(toolLogs.length).toBe(1);
      expect(toolLogs[0].data?.latencyMs).toBeGreaterThanOrEqual(0);

      // All events should have timestamps
      for (const log of logs) {
        expect(log.timestamp).toBeGreaterThan(0);
      }
    });

    it('should emit warn log on tool failure', async () => {
      const logs: AgentLogEvent[] = [];

      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'get_product',
            arguments: { productId: 'nonexistent' },
          }],
        },
        { content: 'Not found.' },
      ]);

      const agent = new ShoppingAgent({
        llm,
        onLog: (event) => logs.push(event),
      });

      await agent.run('Get a product');

      const warnLogs = logs.filter(l => l.level === 'warn');
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(warnLogs[0].message).toContain('get_product');
    });

    it('should not crash when onLog is not provided', async () => {
      const llm = new ScriptedLlm([{ content: 'Done.' }]);
      const agent = new ShoppingAgent({ llm });
      const result = await agent.run('Hello');
      expect(result.success).toBe(true);
    });
  });

  describe('OpenTelemetry-compatible tracing', () => {
    it('should create spans for run, LLM calls, and tool calls', async () => {
      const tracer = new MockTracer();

      const llm = new ScriptedLlm([
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
        { content: 'Found products.' },
      ]);

      const agent = new ShoppingAgent({ llm, tracer });
      await agent.run(`Browse products on ${merchant.domain}`);

      // Should have: 1 run span + 3 LLM spans + 2 tool spans = 6
      expect(tracer.spans.length).toBe(6);

      // Run span
      const runSpan = tracer.spans.find(s => s.name === 'agent.run');
      expect(runSpan).toBeDefined();
      expect(runSpan!.ended).toBe(true);

      // LLM spans
      const llmSpans = tracer.spans.filter(s => s.name === 'agent.llm_call');
      expect(llmSpans.length).toBe(3);
      expect(llmSpans.every(s => s.ended)).toBe(true);

      // Tool spans
      const toolSpans = tracer.spans.filter(s => s.name === 'agent.tool_call');
      expect(toolSpans.length).toBe(2);
      expect(toolSpans[0].attributes?.tool).toBe('discover_merchant');
      expect(toolSpans[1].attributes?.tool).toBe('browse_products');
      expect(toolSpans.every(s => s.ended)).toBe(true);
    });

    it('should not crash when tracer is not provided', async () => {
      const llm = new ScriptedLlm([{ content: 'Done.' }]);
      const agent = new ShoppingAgent({ llm });
      const result = await agent.run('Hello');
      expect(result.success).toBe(true);
    });

    it('should end run span even on max iterations', async () => {
      const tracer = new MockTracer();

      const llm = new ScriptedLlm(
        Array.from({ length: 10 }, (_, i) => ({
          toolCalls: [{
            id: `call_${i}`,
            name: 'browse_products',
            arguments: { page: i + 1 },
          }],
        }))
      );

      const agent = new ShoppingAgent({
        llm,
        tracer,
        maxIterations: 3,
        clientOptions: { timeoutMs: 5000 },
      });

      await agent.run('Browse forever');

      const runSpan = tracer.spans.find(s => s.name === 'agent.run');
      expect(runSpan).toBeDefined();
      expect(runSpan!.ended).toBe(true);
    });
  });

  describe('Streaming observability', () => {
    it('should include usage summary in streaming result', async () => {
      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        },
        {
          content: 'Found the merchant.',
          usage: { promptTokens: 200, completionTokens: 30, totalTokens: 230 },
        },
      ]);

      const agent = new ShoppingAgent({ llm });
      let finalResult: { usage?: AgentUsageSummary } | undefined;

      for await (const event of agent.runStream(`Discover ${merchant.domain}`)) {
        if (event.type === 'done') {
          finalResult = event.result;
        }
      }

      expect(finalResult).toBeDefined();
      expect(finalResult!.usage).toBeDefined();
      expect(finalResult!.usage!.llmCalls).toBe(2);
      expect(finalResult!.usage!.toolCalls).toBe(1);
      expect(finalResult!.usage!.promptTokens).toBe(300);
      expect(finalResult!.usage!.completionTokens).toBe(80);
    });

    it('should emit log events during streaming', async () => {
      const logs: AgentLogEvent[] = [];

      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Done.' },
      ]);

      const agent = new ShoppingAgent({
        llm,
        onLog: (event) => logs.push(event),
      });

      for await (const _event of agent.runStream(`Discover ${merchant.domain}`)) {
        // consume stream
      }

      const startLog = logs.find(l => l.message === 'Agent stream started');
      expect(startLog).toBeDefined();
      const endLog = logs.find(l => l.message === 'Agent stream completed');
      expect(endLog).toBeDefined();
    });

    it('should create tracer spans during streaming', async () => {
      const tracer = new MockTracer();

      const llm = new ScriptedLlm([
        {
          toolCalls: [{
            id: 'call_1',
            name: 'discover_merchant',
            arguments: { domain: merchant.domain },
          }],
        },
        { content: 'Done.' },
      ]);

      const agent = new ShoppingAgent({ llm, tracer });

      for await (const _event of agent.runStream(`Discover ${merchant.domain}`)) {
        // consume stream
      }

      const runSpan = tracer.spans.find(s => s.name === 'agent.runStream');
      expect(runSpan).toBeDefined();
      expect(runSpan!.ended).toBe(true);

      const llmSpans = tracer.spans.filter(s => s.name === 'agent.llm_call');
      expect(llmSpans.length).toBe(2);

      const toolSpans = tracer.spans.filter(s => s.name === 'agent.tool_call');
      expect(toolSpans.length).toBe(1);
    });
  });
});
