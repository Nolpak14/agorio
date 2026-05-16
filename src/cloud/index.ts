/**
 * Agorio Cloud client helper.
 *
 * Wraps the SDK's existing observability primitives (`tracer`, `onLog`,
 * `onStep`, `onComplete`) and POSTs structured events to a hosted ingestion
 * endpoint. Designed to spread directly into `AgentOptions`:
 *
 *     const cloud = agorioCloud({ apiKey: process.env.AGORIO_API_KEY! });
 *     const agent = new ShoppingAgent({ llm, ...cloud });
 *     await agent.run('find me running shoes under $100');
 *
 * Network failures are intentionally swallowed — the helper must never
 * break a running agent.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentTracer,
  AgentSpan,
  AgentLogEvent,
  AgentStep,
  AgentResult,
} from '../types/index.js';
import type {
  IngestBatch,
  LogRecord,
  RunEndPayload,
  RunStartPayload,
  SpanRecord,
} from './types.js';

const DEFAULT_ENDPOINT = 'https://cloud.agorio.dev/api/ingest';
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_FLUSH_INTERVAL_MS = 1000;
const SDK_VERSION = '0.6.0';

export interface AgorioCloudOptions {
  /** API key issued from the dashboard, format: agorio_sk_<env>_<32hex>. */
  apiKey: string;
  /** Override the ingestion endpoint (default: https://cloud.agorio.dev/api/ingest). */
  endpoint?: string;
  /** Flush after this many buffered events (default: 25). */
  batchSize?: number;
  /** Periodic flush interval in ms (default: 1000). */
  flushIntervalMs?: number;
  /** Inject a custom fetch implementation (for tests). */
  fetchImpl?: typeof fetch;
}

export interface AgorioCloudHandle {
  tracer: AgentTracer;
  onLog: (event: AgentLogEvent) => void;
  onStep: (step: AgentStep) => void;
  /** Pass into `AgentOptions.onComplete` (or spread the whole handle). */
  onComplete: (result: AgentResult) => Promise<void>;
  /** Escape hatch for callers that don't use the agent's `run()` lifecycle. */
  beginRun(task: string): {
    runId: string;
    complete(result: AgentResult, error?: Error): Promise<void>;
  };
  /** Force-flush + tear down the periodic flush timer. */
  shutdown(): Promise<void>;
}

export function agorioCloud(opts: AgorioCloudOptions): AgorioCloudHandle {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const fetchImpl: typeof fetch = opts.fetchImpl ?? globalThis.fetch;

  const traceId = randomUUID();
  // v0.6: one run = one trace. We reserve room for multi-run-per-trace later
  // by keeping the field distinct on the wire.
  const runId = traceId;

  const spanBuffer: SpanRecord[] = [];
  const logBuffer: LogRecord[] = [];
  let runStarted = false;
  let runEnded = false;

  const post = async (batch: IngestBatch): Promise<void> => {
    try {
      await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(batch),
        keepalive: true,
      });
    } catch (err) {
      console.warn(
        '[agorioCloud] ingestion request failed:',
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const flushSpans = async (): Promise<void> => {
    if (spanBuffer.length === 0) return;
    const events = spanBuffer.splice(0, spanBuffer.length);
    await post({ traceId, runId, batchType: 'spans', events });
  };

  const flushLogs = async (): Promise<void> => {
    if (logBuffer.length === 0) return;
    const events = logBuffer.splice(0, logBuffer.length);
    await post({ traceId, runId, batchType: 'logs', events });
  };

  const flushAll = async (): Promise<void> => {
    await Promise.all([flushSpans(), flushLogs()]);
  };

  const maybeFlushSpans = (): void => {
    if (spanBuffer.length >= batchSize) {
      void flushSpans();
    }
  };
  const maybeFlushLogs = (): void => {
    if (logBuffer.length >= batchSize) {
      void flushLogs();
    }
  };

  const sendRunStart = (task: string): void => {
    if (runStarted) return;
    runStarted = true;
    const payload: RunStartPayload = {
      traceId,
      runId,
      task,
      startedAt: Date.now(),
      sdkVersion: SDK_VERSION,
    };
    void post({ traceId, runId, batchType: 'run_start', payload });
  };

  const sendRunEnd = async (result: AgentResult, error?: Error): Promise<void> => {
    if (runEnded) return;
    runEnded = true;
    const payload: RunEndPayload = {
      traceId,
      runId,
      endedAt: Date.now(),
      status: result.success && !error ? 'success' : 'failure',
      finalAnswer: result.answer || undefined,
      error: error?.message ?? result.error,
      usage: result.usage,
    };
    // Drain spans/logs first so the dashboard never shows an "ended" run
    // before its child rows arrive.
    await flushAll();
    await post({ traceId, runId, batchType: 'run_end', payload });
  };

  const flushTimer: ReturnType<typeof setInterval> = setInterval(() => {
    void flushAll();
  }, flushIntervalMs);
  // Don't keep the process alive just for the flush loop.
  if (typeof flushTimer === 'object' && flushTimer !== null && 'unref' in flushTimer) {
    (flushTimer as unknown as { unref(): void }).unref();
  }

  const tracer: AgentTracer = {
    startSpan(name: string, attributes?: Record<string, string | number | boolean>): AgentSpan {
      const startedAt = Date.now();
      let ended = false;
      // Auto-emit run_start when the agent's outermost span opens. This lets
      // callers wire `agorioCloud()` purely through `AgentOptions` without
      // needing to call `beginRun()` themselves.
      if (!runStarted && (name === 'agent.run' || name === 'agent.runStream')) {
        const task =
          (attributes && typeof attributes.task === 'string' ? attributes.task : '') as string;
        sendRunStart(task);
      }
      return {
        name,
        attributes,
        end(): void {
          if (ended) return;
          ended = true;
          const endedAt = Date.now();
          spanBuffer.push({
            name,
            attributes,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
          });
          maybeFlushSpans();
        },
      };
    },
  };

  const onLog = (event: AgentLogEvent): void => {
    logBuffer.push({
      level: event.level,
      message: event.message,
      data: event.data,
      timestamp: event.timestamp,
    });
    maybeFlushLogs();
  };

  const onStep = (_step: AgentStep): void => {
    // Steps are derivable from spans+logs for v0.6. Reserved for future use.
  };

  const onComplete = async (result: AgentResult): Promise<void> => {
    await sendRunEnd(result);
  };

  const beginRun = (task: string): { runId: string; complete(r: AgentResult, e?: Error): Promise<void> } => {
    sendRunStart(task);
    return {
      runId,
      complete: async (result, error) => sendRunEnd(result, error),
    };
  };

  const shutdown = async (): Promise<void> => {
    clearInterval(flushTimer);
    await flushAll();
  };

  return { tracer, onLog, onStep, onComplete, beginRun, shutdown };
}

export type { SpanRecord, LogRecord, IngestBatch, RunStartPayload, RunEndPayload } from './types.js';
