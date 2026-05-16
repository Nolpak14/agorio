/**
 * Tests for withRetry — exponential backoff over fetch-shaped functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../src/http/retry.js';

function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the response on the first 2xx without retrying', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withRetry(fetchFn);

    const res = await wrapped('https://example.com/');
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 then succeeds', async () => {
    const fetchFn = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const wrapped = withRetry(fetchFn, { baseDelayMs: 10, jitter: false });
    const promise = wrapped('https://example.com/');
    await vi.advanceTimersByTimeAsync(20);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('respects maxAttempts and returns the last failing response', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(503));
    const onRetry = vi.fn();
    const wrapped = withRetry(fetchFn, { maxAttempts: 3, baseDelayMs: 5, jitter: false, onRetry });

    const promise = wrapped('https://example.com/');
    await vi.advanceTimersByTimeAsync(100);
    const res = await promise;

    expect(res.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // retries between attempts: 1→2, 2→3
  });

  it('does NOT retry on a non-retryable status (400)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(400));
    const wrapped = withRetry(fetchFn, { maxAttempts: 3, baseDelayMs: 1 });

    const res = await wrapped('https://example.com/');
    expect(res.status).toBe(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on a network error and rethrows after exhaustion', async () => {
    const err = new TypeError('fetch failed');
    const fetchFn = vi.fn(async () => {
      throw err;
    });
    const wrapped = withRetry(fetchFn, { maxAttempts: 2, baseDelayMs: 1, jitter: false });

    const promise = wrapped('https://example.com/').catch(e => e);
    await vi.advanceTimersByTimeAsync(20);
    const thrown = await promise;

    expect(thrown).toBe(err);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After in seconds on a 429 response', async () => {
    const fetchFn = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse(200));

    const onRetry = vi.fn();
    const wrapped = withRetry(fetchFn, { baseDelayMs: 5, jitter: false, onRetry });
    const promise = wrapped('https://example.com/');
    await vi.advanceTimersByTimeAsync(3000);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ delayMs: 2000, status: 429 })
    );
  });

  it('grows backoff exponentially when jitter is disabled', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(503));
    const onRetry = vi.fn();
    const wrapped = withRetry(fetchFn, {
      maxAttempts: 4,
      baseDelayMs: 50,
      jitter: false,
      onRetry,
    });

    const promise = wrapped('https://example.com/');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    const delays = onRetry.mock.calls.map(c => c[0].delayMs);
    expect(delays).toEqual([50, 100, 200]);
  });

  it('keeps jittered delay within ±50% of the base curve', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(503));
    const onRetry = vi.fn();
    const wrapped = withRetry(fetchFn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      jitter: true,
      onRetry,
    });

    const promise = wrapped('https://example.com/');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    for (const call of onRetry.mock.calls) {
      const { attempt, delayMs } = call[0];
      const expected = 100 * Math.pow(2, attempt - 1);
      expect(delayMs).toBeGreaterThanOrEqual(Math.floor(expected * 0.5));
      expect(delayMs).toBeLessThanOrEqual(Math.ceil(expected * 1.5));
    }
  });

  it('lets shouldRetry override the default status-code check', async () => {
    const fetchFn = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(400))
      .mockResolvedValueOnce(jsonResponse(200));

    const wrapped = withRetry(fetchFn, {
      maxAttempts: 2,
      baseDelayMs: 1,
      jitter: false,
      shouldRetry: (res) => res?.status === 400,
    });

    const promise = wrapped('https://example.com/');
    await vi.advanceTimersByTimeAsync(20);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
