/**
 * Sub-agent primitive — invoke a child ShoppingAgent from inside a parent
 * run with tracer/onLog wrapped to inject `parent_span_id` + `sub_agent_name`
 * on every child span and log event. The Cloud trace explorer reads these
 * attributes to render the multi-agent run as a tree.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentLogEvent,
  AgentResult,
  AgentSpan,
  AgentTracer,
  SubAgent,
  SubAgentBuildContext,
} from '../types/index.js';

export interface RunSubAgentOptions {
  subAgent: SubAgent;
  input: string;
  parentTracer?: AgentTracer;
  parentOnLog?: (event: AgentLogEvent) => void;
  /** Cap on recursive sub-agent depth. Default: 3. */
  maxDepth?: number;
  /** Parent depth — child depth is parent + 1. Default: 0 (root). */
  parentDepth?: number;
}

export const DEFAULT_SUB_AGENT_MAX_DEPTH = 3;

export async function runSubAgent(opts: RunSubAgentOptions): Promise<AgentResult> {
  const parentDepth = opts.parentDepth ?? 0;
  const childDepth = parentDepth + 1;
  const maxDepth = opts.maxDepth ?? DEFAULT_SUB_AGENT_MAX_DEPTH;
  if (childDepth > maxDepth) {
    throw new Error(
      `runSubAgent: depth ${childDepth} exceeds maxDepth ${maxDepth} (recursion guard)`
    );
  }

  validateInputSchema(opts.subAgent, opts.input);

  const invocationId = randomUUID();
  const wrappedTracer = opts.parentTracer
    ? wrapTracerWithParent(opts.parentTracer, invocationId, opts.subAgent.name)
    : undefined;
  const wrappedOnLog = opts.parentOnLog
    ? wrapOnLogWithParent(opts.parentOnLog, opts.subAgent.name, invocationId)
    : undefined;

  const span = opts.parentTracer?.startSpan('agent.sub_agent', {
    sub_agent_name: opts.subAgent.name,
    sub_agent_invocation_id: invocationId,
    depth: childDepth,
  });

  const ctx: SubAgentBuildContext = {
    tracer: wrappedTracer,
    onLog: wrappedOnLog,
    depth: childDepth,
  };

  try {
    const built = opts.subAgent.build(ctx);
    const runnable = built as { run: (task: string) => Promise<AgentResult> };
    if (!runnable || typeof runnable.run !== 'function') {
      throw new Error(
        `SubAgent.build('${opts.subAgent.name}') did not return an object with a run() method`
      );
    }
    return await runnable.run(opts.input);
  } finally {
    span?.end();
  }
}

function wrapTracerWithParent(
  inner: AgentTracer,
  parentSpanId: string,
  subAgentName: string
): AgentTracer {
  return {
    startSpan(name: string, attributes): AgentSpan {
      return inner.startSpan(name, {
        ...attributes,
        parent_span_id: parentSpanId,
        sub_agent_name: subAgentName,
      });
    },
  };
}

function wrapOnLogWithParent(
  inner: (event: AgentLogEvent) => void,
  subAgentName: string,
  invocationId: string
): (event: AgentLogEvent) => void {
  return (event) => {
    inner({
      ...event,
      data: {
        ...event.data,
        sub_agent_name: subAgentName,
        sub_agent_invocation_id: invocationId,
      },
    });
  };
}

function validateInputSchema(subAgent: SubAgent, input: string): void {
  const schema = subAgent.inputSchema;
  if (!schema) return;
  if (typeof schema.type === 'string' && schema.type !== 'string') {
    // Only string inputs flow through this helper today; structured inputs
    // round-trip via JSON in the parent LLM's tool-call argument. The chain
    // layer can stringify before calling runSubAgent.
    return;
  }
}
