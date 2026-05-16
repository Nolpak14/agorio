/**
 * Tests for TokenBucket and withRateLimit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket, withRateLimit } from '../src/http/rate-limit.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at full capacity', () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerSec: 1 });
    expect(bucket.available()).toBe(5);
  });

  it('decrements on take and waits when empty', async () => {
    let now = 1_000;
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 2, now: () => now });

    await bucket.take(1);
    await bucket.take(1);
    expect(bucket.available()).toBe(0);

    // 3rd take needs ~500ms at refill 2/sec
    const promise = bucket.take(1);
    now += 500;
    await vi.advanceTimersByTimeAsync(500);
    await promise;
    expect(bucket.available()).toBeLessThan(0.001);
  });

  it('refills at refillPerSec and caps at capacity', () => {
    let now = 1_000;
    const bucket = new TokenBucket({ capacity: 10, refillPerSec: 5, now: () => now });

    // Drain
    void bucket.take(10);
    expect(bucket.available()).toBe(0);

    // 1 second of real time elapsed → +5 tokens
    now += 1_000;
    expect(bucket.available()).toBeCloseTo(5, 3);

    // 5 more seconds → would refill 25 more, but cap is 10
    now += 5_000;
    expect(bucket.available()).toBe(10);
  });

  it('throws when asked for more than capacity in one take', async () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 1 });
    await expect(bucket.take(3)).rejects.toThrow(/cannot take 3/);
  });
});

describe('withRateLimit', () => {
  it('shares a single bucket across all hosts when given a TokenBucket', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      new Response(JSON.stringify({ url: String(url) }), { status: 200 })
    );
    let now = 1_000;
    const bucket = new TokenBucket({ capacity: 10, refillPerSec: 1, now: () => now });
    const limited = withRateLimit(fetchFn, bucket);

    await limited('https://a.example.com/');
    await limited('https://b.example.com/');

    expect(fetchFn).toHaveBeenCalledTimes(2);
    // No clock movement → no refill → exactly 2 tokens consumed.
    expect(bucket.available()).toBe(8);
  });

  it('creates one bucket per origin via factory and memoizes it', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }));
    const factory = vi.fn(({ origin }) => new TokenBucket({
      capacity: 5,
      refillPerSec: 5,
    }));

    const limited = withRateLimit(fetchFn, factory);

    await limited('https://shop-a.myshopify.com/api');
    await limited('https://shop-a.myshopify.com/api');
    await limited('https://shop-b.myshopify.com/api');

    // Factory invoked once per distinct origin
    expect(factory).toHaveBeenCalledTimes(2);
    const origins = factory.mock.calls.map(c => c[0].origin).sort();
    expect(origins).toEqual([
      'https://shop-a.myshopify.com',
      'https://shop-b.myshopify.com',
    ]);
  });
});
