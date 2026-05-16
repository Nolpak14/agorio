/**
 * Tests for the `agorioCloud()` client helper.
 *
 * These tests verify wire-format correctness, batching, and the contract
 * that network failures must not surface to the calling agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agorioCloud } from '../src/cloud/index.js';
import type { IngestBatch } from '../src/cloud/types.js';
import type { AgentResult } from '../src/types/index.js';

const baseResult: AgentResult = {
  success: true,
  answer: 'done',
  steps: [],
  iterations: 1,
  usage: {
    totalTokens: 100,
    promptTokens: 60,
    completionTokens: 40,
    llmCalls: 2,
    toolCalls: 1,
    toolCallLatency: { search_products: [12] },
    totalLatencyMs: 250,
  },
};

interface CapturedCall {
  url: string;
  init: RequestInit;
  body: IngestBatch;
}

function makeFetchSpy(impl?: () => Promise<Response>): { fetchImpl: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = init?.body ? (JSON.parse(init.body as string) as IngestBatch) : ({} as IngestBatch);
    calls.push({ url, init: init ?? {}, body });
    return impl ? impl() : new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('agorioCloud()', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('emits a SpanRecord with positive durationMs when a span ends', async () => {
    const { fetchImpl, calls } = makeFetchSpy();
    const cloud = agorioCloud({
      apiKey: 'agorio_sk_test_x',
      fetchImpl,
      batchSize: 1, // force immediate flush
      flushIntervalMs: 10_000,
    });

    const span = cloud.tracer.startSpan('agent.tool_call', { tool: 'search_products' });
    // Force a measurable elapsed time without making the test slow.
    await new Promise((resolve) => setTimeout(resolve, 5));
    span.end();

    // Allow the void-flush microtask to run.
    await new Promise((resolve) => setImmediate(resolve));

    const spanBatch = calls.find((c) => c.body.batchType === 'spans');
    expect(spanBatch).toBeDefined();
    const events = spanBatch!.body.events as Array<{ name: string; durationMs: number; startedAt: number; endedAt: number }>;
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('agent.tool_call');
    expect(events[0].durationMs).toBeGreaterThan(0);
    expect(events[0].endedAt).toBeGreaterThanOrEqual(events[0].startedAt);

    await cloud.shutdown();
  });

  it('batches events and flushes at batchSize, then drains on shutdown', async () => {
    const { fetchImpl, calls } = makeFetchSpy();
    const cloud = agorioCloud({
      apiKey: 'agorio_sk_test_x',
      fetchImpl,
      batchSize: 25,
      flushIntervalMs: 10_000, // disable timer-driven flush
    });

    for (let i = 0; i < 30; i++) {
      cloud.tracer.startSpan(`span.${i}`).end();
    }

    // First flush at threshold should have happened synchronously after the 25th span.
    await new Promise((resolve) => setImmediate(resolve));

    const spanBatches = calls.filter((c) => c.body.batchType === 'spans');
    expect(spanBatches).toHaveLength(1);
    expect(spanBatches[0].body.events).toHaveLength(25);

    await cloud.shutdown();

    const allSpanBatches = calls.filter((c) => c.body.batchType === 'spans');
    expect(allSpanBatches).toHaveLength(2);
    expect(allSpanBatches[1].body.events).toHaveLength(5);
  });

  it('sends Authorization: Bearer <apiKey> and JSON body with correct shape', async () => {
    const { fetchImpl, calls } = makeFetchSpy();
    const cloud = agorioCloud({
      apiKey: 'agorio_sk_prod_deadbeef',
      fetchImpl,
      batchSize: 1,
      flushIntervalMs: 10_000,
    });

    cloud.tracer.startSpan('agent.run', { task: 'hello' }); // triggers run_start
    await new Promise((resolve) => setImmediate(resolve));

    const startBatch = calls.find((c) => c.body.batchType === 'run_start');
    expect(startBatch).toBeDefined();
    const headers = startBatch!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer agorio_sk_prod_deadbeef');
    expect(headers['Content-Type']).toBe('application/json');
    expect(startBatch!.url).toBe('https://cloud.agorio.dev/api/ingest');
    expect(startBatch!.body.traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(startBatch!.body.runId).toBe(startBatch!.body.traceId);
    const payload = startBatch!.body.payload as { task: string; sdkVersion: string };
    expect(payload.task).toBe('hello');
    expect(payload.sdkVersion).toMatch(/^\d+\.\d+\.\d+/);

    await cloud.shutdown();
  });

  it('swallows fetch errors and does not throw out of span.end() or onComplete()', async () => {
    const { fetchImpl } = makeFetchSpy(() => Promise.reject(new Error('boom')));
    const cloud = agorioCloud({
      apiKey: 'agorio_sk_test_x',
      fetchImpl,
      batchSize: 1,
      flushIntervalMs: 10_000,
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => cloud.tracer.startSpan('x').end()).not.toThrow();
    await expect(cloud.onComplete(baseResult)).resolves.not.toThrow();

    // Give the queued microtasks a turn so the warn fires.
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
    await cloud.shutdown();
  });

  it('beginRun() emits run_start then run_end with the final usage summary', async () => {
    const { fetchImpl, calls } = makeFetchSpy();
    const cloud = agorioCloud({
      apiKey: 'agorio_sk_test_x',
      fetchImpl,
      batchSize: 1,
      flushIntervalMs: 10_000,
    });

    const run = cloud.beginRun('buy headphones');
    expect(run.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);

    await run.complete(baseResult);

    const startBatch = calls.find((c) => c.body.batchType === 'run_start');
    const endBatch = calls.find((c) => c.body.batchType === 'run_end');
    expect(startBatch).toBeDefined();
    expect(endBatch).toBeDefined();
    const startPayload = startBatch!.body.payload as { task: string };
    expect(startPayload.task).toBe('buy headphones');
    const endPayload = endBatch!.body.payload as {
      status: 'success' | 'failure';
      usage?: { totalTokens: number };
      finalAnswer?: string;
    };
    expect(endPayload.status).toBe('success');
    expect(endPayload.usage?.totalTokens).toBe(100);
    expect(endPayload.finalAnswer).toBe('done');

    await cloud.shutdown();
  });
});
