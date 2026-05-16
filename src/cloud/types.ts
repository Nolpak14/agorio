/**
 * Wire-format types for Agorio Cloud.
 *
 * These types are exported from the SDK so that both the `agorioCloud()`
 * helper and the `cloud/` Next.js ingestion endpoint can import a single
 * source of truth for the JSON payloads exchanged over the wire.
 */

import type { AgentUsageSummary } from '../types/index.js';

export interface SpanRecord {
  name: string;
  attributes?: Record<string, unknown>;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface LogRecord {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface RunStartPayload {
  traceId: string;
  runId: string;
  task: string;
  startedAt: number;
  sdkVersion: string;
}

export interface RunEndPayload {
  traceId: string;
  runId: string;
  endedAt: number;
  status: 'success' | 'failure';
  finalAnswer?: string;
  error?: string;
  usage?: AgentUsageSummary;
}

export type IngestBatchType = 'run_start' | 'spans' | 'logs' | 'run_end';

export interface IngestBatch {
  traceId: string;
  runId: string;
  batchType: IngestBatchType;
  /** Present for batchType 'spans' or 'logs'. */
  events?: SpanRecord[] | LogRecord[];
  /** Present for batchType 'run_start' or 'run_end'. */
  payload?: RunStartPayload | RunEndPayload;
}
