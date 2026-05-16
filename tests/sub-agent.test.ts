/**
 * Tests for runSubAgent — sub-agent invocation with tracer/onLog wrapping.
 */

import { describe, it, expect, vi } from 'vitest';
import { runSubAgent } from '../src/agent/sub-agent.js';
import type {
  AgentLogEvent,
  AgentResult,
  AgentSpan,
  AgentTracer,
  SubAgent,
} from '../src/types/index.js';

interface MockSpan extends AgentSpan {
  startAttributes: Record<string, string | number | boolean> | undefined;
  ended: boolean;
}

function makeTracer(): AgentTracer & { spans: MockSpan[] } {
  const spans: MockSpan[] = [];
  return {
    spans,
    startSpan(name, attributes) {
      const span: MockSpan = {
        name,
        attributes,
        startAttributes: attributes,
        ended: false,
        end() {
          this.ended = true;
        },
      } as MockSpan;
      spans.push(span);
      return span;
    },
  };
}

/**
 * Minimal SubAgent whose `build` returns a stub agent with a scripted run().
 */
function makeStubSubAgent(
  name: string,
  runImpl: (input: string, ctx: { tracer?: AgentTracer; depth: number }) => Promise<AgentResult>
): SubAgent {
  return {
    name,
    description: `Stub sub-agent ${name}`,
    build(ctx) {
      return {
        run: (input: string) => runImpl(input, { tracer: ctx.tracer, depth: ctx.depth }),
      };
    },
  };
}

const RESULT: AgentResult = {
  success: true,
  answer: 'done',
  steps: [],
  iterations: 1,
};

describe('runSubAgent', () => {
  it('runs the child agent and returns its AgentResult', async () => {
    const sub = makeStubSubAgent('child', async (input) => ({
      ...RESULT,
      answer: `echo: ${input}`,
    }));

    const result = await runSubAgent({ subAgent: sub, input: 'hello' });
    expect(result.answer).toBe('echo: hello');
    expect(result.success).toBe(true);
  });

  it('injects parent_span_id and sub_agent_name on child spans', async () => {
    const tracer = makeTracer();

    const sub = makeStubSubAgent('finder', async (_input, ctx) => {
      const span = ctx.tracer?.startSpan('child.work', { foo: 'bar' });
      span?.end();
      return RESULT;
    });

    await runSubAgent({ subAgent: sub, input: 'go', parentTracer: tracer });

    // First span is the wrapper "agent.sub_agent"; second is the child's "child.work"
    expect(tracer.spans.map(s => s.name)).toEqual(['agent.sub_agent', 'child.work']);

    const childSpan = tracer.spans.find(s => s.name === 'child.work')!;
    expect(childSpan.startAttributes).toMatchObject({
      foo: 'bar',
      sub_agent_name: 'finder',
    });
    expect(typeof childSpan.startAttributes!.parent_span_id).toBe('string');

    // Wrapper span carries the invocation id and is ended.
    const wrapperSpan = tracer.spans.find(s => s.name === 'agent.sub_agent')!;
    expect(wrapperSpan.startAttributes).toMatchObject({
      sub_agent_name: 'finder',
      depth: 1,
    });
    expect(wrapperSpan.ended).toBe(true);
  });

  it('wraps onLog so child events carry sub_agent_name metadata', async () => {
    const onLog = vi.fn<(e: AgentLogEvent) => void>();
    let capturedOnLog: ((e: AgentLogEvent) => void) | undefined;

    const sub: SubAgent = {
      name: 'logger',
      description: 'logs',
      build(ctx) {
        capturedOnLog = ctx.onLog;
        return { run: async () => RESULT };
      },
    };

    await runSubAgent({ subAgent: sub, input: 'go', parentOnLog: onLog });

    capturedOnLog!({
      level: 'info',
      message: 'hi',
      timestamp: 1,
      data: { iteration: 2 },
    });

    expect(onLog).toHaveBeenCalledTimes(1);
    const event = onLog.mock.calls[0][0];
    expect(event.message).toBe('hi');
    expect(event.data).toMatchObject({
      iteration: 2,
      sub_agent_name: 'logger',
    });
    expect(typeof event.data!.sub_agent_invocation_id).toBe('string');
  });

  it('throws when child depth exceeds maxDepth (recursion guard)', async () => {
    const sub = makeStubSubAgent('loop', async () => RESULT);

    await expect(
      runSubAgent({
        subAgent: sub,
        input: 'x',
        parentDepth: 3,
        maxDepth: 3,
      })
    ).rejects.toThrow(/depth 4 exceeds maxDepth 3/);
  });

  it('throws a clear error when SubAgent.build returns something without run()', async () => {
    const bad: SubAgent = {
      name: 'broken',
      description: 'no run method',
      build: () => ({} as unknown),
    };

    await expect(runSubAgent({ subAgent: bad, input: 'x' })).rejects.toThrow(
      /did not return an object with a run\(\) method/
    );
  });

  it('ends the wrapper span even when the child throws', async () => {
    const tracer = makeTracer();
    const sub = makeStubSubAgent('thrower', async () => {
      throw new Error('boom');
    });

    await expect(
      runSubAgent({ subAgent: sub, input: 'x', parentTracer: tracer })
    ).rejects.toThrow('boom');

    const wrapper = tracer.spans.find(s => s.name === 'agent.sub_agent')!;
    expect(wrapper.ended).toBe(true);
  });
});
