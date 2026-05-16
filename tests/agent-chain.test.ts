/**
 * Tests for AgentChain — sequential sub-agent composition.
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentChain } from '../src/agent/agent-chain.js';
import type { AgentResult, SubAgent } from '../src/types/index.js';

function stubResult(partial: Partial<AgentResult> & { answer: string }): AgentResult {
  return {
    success: true,
    answer: partial.answer,
    steps: partial.steps ?? [],
    iterations: partial.iterations ?? 1,
    usage: partial.usage,
    error: partial.error,
  };
}

function stubAgent(
  name: string,
  runImpl: (input: string) => Promise<AgentResult> | AgentResult
): SubAgent {
  return {
    name,
    description: `stub ${name}`,
    build: () => ({ run: async (input: string) => runImpl(input) }),
  };
}

describe('AgentChain', () => {
  it('runs steps sequentially and threads the previous answer as the next input', async () => {
    const order: string[] = [];
    const a = stubAgent('a', async (input) => {
      order.push(`a:${input}`);
      return stubResult({ answer: 'A-out' });
    });
    const b = stubAgent('b', async (input) => {
      order.push(`b:${input}`);
      return stubResult({ answer: 'B-out' });
    });
    const c = stubAgent('c', async (input) => {
      order.push(`c:${input}`);
      return stubResult({ answer: 'C-out' });
    });

    const chain = new AgentChain().add(a).add(b).add(c);
    const result = await chain.run('initial');

    expect(order).toEqual(['a:initial', 'b:A-out', 'c:B-out']);
    expect(result.success).toBe(true);
    expect(result.answer).toBe('C-out');
    expect(chain.length).toBe(3);
  });

  it('uses inputFrom to derive a custom input for a step', async () => {
    const observed: string[] = [];
    const first = stubAgent('first', async () => stubResult({ answer: 'one' }));
    const second = stubAgent('second', async (input) => {
      observed.push(input);
      return stubResult({ answer: 'two' });
    });

    const chain = new AgentChain()
      .add(first)
      .add(second, (ctx, initial) => `combined:${initial}+${ctx.results[0].output.answer}`);

    await chain.run('initial');
    expect(observed).toEqual(['combined:initial+one']);
  });

  it('halts on the first failing step and returns aggregated steps', async () => {
    const ran = vi.fn();
    const ok = stubAgent('ok', async () => stubResult({ answer: 'ok-out', steps: [
      { iteration: 1, type: 'tool_call', toolName: 't1', timestamp: 1 },
    ] }));
    const fail = stubAgent('fail', async () => ({
      ...stubResult({ answer: 'partial' }),
      success: false,
      error: 'something broke',
    } as AgentResult));
    const never = stubAgent('never', async () => {
      ran();
      return stubResult({ answer: 'should-not-run' });
    });

    const chain = new AgentChain().add(ok).add(fail).add(never);
    const result = await chain.run('go');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/something broke/);
    expect(ran).not.toHaveBeenCalled();
    expect(result.steps).toHaveLength(1); // only the first sub-agent's steps were aggregated
  });

  it('exposes prior results to inputFrom via ChainContext', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const a = stubAgent('a', async () => stubResult({ answer: 'A' }));
    const b = stubAgent('b', async () => stubResult({ answer: 'B' }));
    const c = stubAgent('c', async (input) => {
      seen.push({ input });
      return stubResult({ answer: 'C' });
    });

    const chain = new AgentChain()
      .add(a)
      .add(b)
      .add(c, (ctx) => ctx.results.map(r => `${r.subAgentName}=${r.output.answer}`).join(','));

    await chain.run('seed');
    expect(seen[0]).toEqual({ input: 'a=A,b=B' });
  });

  it('aggregates usage across steps into the chain result', async () => {
    const a = stubAgent('a', async () => stubResult({
      answer: 'a',
      usage: {
        totalTokens: 30, promptTokens: 20, completionTokens: 10,
        llmCalls: 1, toolCalls: 2,
        toolCallLatency: { foo: [100] },
        totalLatencyMs: 50,
      },
    }));
    const b = stubAgent('b', async () => stubResult({
      answer: 'b',
      usage: {
        totalTokens: 60, promptTokens: 40, completionTokens: 20,
        llmCalls: 2, toolCalls: 3,
        toolCallLatency: { foo: [200], bar: [50] },
        totalLatencyMs: 80,
      },
    }));

    const chain = new AgentChain().add(a).add(b);
    const result = await chain.run('start');

    expect(result.usage).toBeDefined();
    expect(result.usage!.promptTokens).toBe(60);
    expect(result.usage!.completionTokens).toBe(30);
    expect(result.usage!.totalTokens).toBe(90);
    expect(result.usage!.llmCalls).toBe(3);
    expect(result.usage!.toolCalls).toBe(5);
    expect(result.usage!.toolCallLatency.foo).toEqual([100, 200]);
    expect(result.usage!.toolCallLatency.bar).toEqual([50]);
  });
});
