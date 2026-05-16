/**
 * AgentChain — sequential composition of sub-agents.
 *
 *   const chain = new AgentChain()
 *     .add(findBestPrice)
 *     .add(checkout, (ctx) => ctx.results[0].output.answer)
 *     .add(trackShipment);
 *
 *   const result = await chain.run('Buy 100 ergonomic chairs under $500 each', {
 *     tracer: parentTracer,
 *     onLog: parentOnLog,
 *   });
 *
 * Each step's input is derived from prior step outputs via `inputFrom`,
 * or defaults to the previous step's `answer`. The chain halts on the
 * first failure and returns a synthesized AgentResult that aggregates
 * the steps that did run.
 */

import { runSubAgent } from './sub-agent.js';
import type {
  AgentChainStep,
  AgentLogEvent,
  AgentResult,
  AgentStep,
  AgentTracer,
  ChainContext,
  ChainResultEntry,
  SubAgent,
} from '../types/index.js';

export interface AgentChainRunOptions {
  tracer?: AgentTracer;
  onLog?: (event: AgentLogEvent) => void;
  /** Cap on the depth of any individual sub-agent's own children. Default: 3. */
  maxDepth?: number;
}

export class AgentChain {
  private readonly steps: AgentChainStep[] = [];

  add(subAgent: SubAgent, inputFrom?: AgentChainStep['inputFrom']): this {
    this.steps.push({ subAgent, inputFrom });
    return this;
  }

  /** Number of configured steps. Useful for tests / introspection. */
  get length(): number {
    return this.steps.length;
  }

  async run(initialInput: string, options: AgentChainRunOptions = {}): Promise<AgentResult> {
    const ctx: ChainContext = { results: [], shared: {} };
    const overallStart = Date.now();
    const aggregatedSteps: AgentStep[] = [];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLlmCalls = 0;
    let totalToolCalls = 0;
    const toolCallLatency: Record<string, number[]> = {};

    for (const step of this.steps) {
      const input = step.inputFrom
        ? step.inputFrom(ctx, initialInput)
        : ctx.results.length === 0
          ? initialInput
          : ctx.results[ctx.results.length - 1].output.answer;

      const output = await runSubAgent({
        subAgent: step.subAgent,
        input,
        parentTracer: options.tracer,
        parentOnLog: options.onLog,
        maxDepth: options.maxDepth,
        parentDepth: 0,
      });

      const entry: ChainResultEntry = { subAgentName: step.subAgent.name, output };
      ctx.results.push(entry);

      for (const s of output.steps) {
        aggregatedSteps.push(s);
      }

      if (output.usage) {
        totalPromptTokens += output.usage.promptTokens;
        totalCompletionTokens += output.usage.completionTokens;
        totalLlmCalls += output.usage.llmCalls;
        totalToolCalls += output.usage.toolCalls;
        for (const [tool, latencies] of Object.entries(output.usage.toolCallLatency)) {
          toolCallLatency[tool] = (toolCallLatency[tool] ?? []).concat(latencies);
        }
      }

      if (!output.success) {
        return synthesize({
          success: false,
          answer: output.answer,
          error: output.error ?? `Sub-agent "${step.subAgent.name}" did not complete successfully`,
          steps: aggregatedSteps,
          iterations: aggregatedSteps.filter(s => s.type === 'tool_call').length,
          totalPromptTokens,
          totalCompletionTokens,
          totalLlmCalls,
          totalToolCalls,
          toolCallLatency,
          startedAt: overallStart,
        });
      }
    }

    const lastOutput = ctx.results[ctx.results.length - 1]?.output;
    return synthesize({
      success: true,
      answer: lastOutput?.answer ?? '',
      steps: aggregatedSteps,
      iterations: aggregatedSteps.filter(s => s.type === 'tool_call').length,
      totalPromptTokens,
      totalCompletionTokens,
      totalLlmCalls,
      totalToolCalls,
      toolCallLatency,
      startedAt: overallStart,
    });
  }
}

function synthesize(args: {
  success: boolean;
  answer: string;
  steps: AgentStep[];
  iterations: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalLlmCalls: number;
  totalToolCalls: number;
  toolCallLatency: Record<string, number[]>;
  startedAt: number;
  error?: string;
}): AgentResult {
  return {
    success: args.success,
    answer: args.answer,
    steps: args.steps,
    iterations: args.iterations,
    error: args.error,
    usage: {
      totalTokens: args.totalPromptTokens + args.totalCompletionTokens,
      promptTokens: args.totalPromptTokens,
      completionTokens: args.totalCompletionTokens,
      llmCalls: args.totalLlmCalls,
      toolCalls: args.totalToolCalls,
      toolCallLatency: args.toolCallLatency,
      totalLatencyMs: Date.now() - args.startedAt,
    },
  };
}
