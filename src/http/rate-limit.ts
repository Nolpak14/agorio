/**
 * HTTP rate-limit primitive — token-bucket per host, drop-in over a
 * fetch-shaped function.
 *
 *   const bucket = new TokenBucket({ capacity: 2, refillPerSec: 2 });
 *   const limited = withRateLimit(globalThis.fetch, bucket);
 *
 * For multi-host workloads pass a factory keyed on URL origin:
 *
 *   const limited = withRateLimit(globalThis.fetch, ({ origin }) =>
 *     origin.endsWith('.myshopify.com')
 *       ? new TokenBucket({ capacity: 2, refillPerSec: 2 })
 *       : new TokenBucket({ capacity: 10, refillPerSec: 10 })
 *   );
 *
 * Bucket factories are memoized by origin so each host gets one bucket
 * for the lifetime of the wrapped fetch.
 */

export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold (burst size). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
  /** Optional injected clock for tests. Default: Date.now */
  now?: () => number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(options: TokenBucketOptions) {
    if (options.capacity <= 0) throw new Error('TokenBucket: capacity must be positive');
    if (options.refillPerSec <= 0) throw new Error('TokenBucket: refillPerSec must be positive');
    this.capacity = options.capacity;
    this.refillPerMs = options.refillPerSec / 1000;
    this.now = options.now ?? Date.now;
    this.tokens = options.capacity;
    this.lastRefill = this.now();
  }

  /**
   * Block until `n` tokens are available, then consume them.
   * Tokens accrue at `refillPerSec` and cap at `capacity`.
   */
  async take(n = 1): Promise<void> {
    if (n > this.capacity) {
      throw new Error(`TokenBucket: cannot take ${n} tokens, capacity is ${this.capacity}`);
    }
    while (true) {
      this.refill();
      if (this.tokens >= n) {
        this.tokens -= n;
        return;
      }
      const deficit = n - this.tokens;
      const waitMs = Math.max(1, Math.ceil(deficit / this.refillPerMs));
      await sleep(waitMs);
    }
  }

  /** Current token balance (after a refill tick). For introspection / tests. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = this.now();
    const elapsed = Math.max(0, now - this.lastRefill);
    if (elapsed === 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }
}

export interface RateLimitBucketContext {
  origin: string;
  url: URL;
}

export type BucketFactory = TokenBucket | ((ctx: RateLimitBucketContext) => TokenBucket);

export function withRateLimit(
  fetchFn: typeof globalThis.fetch,
  bucketOrFactory: BucketFactory
): typeof globalThis.fetch {
  const memo = new Map<string, TokenBucket>();

  const resolveBucket = (url: URL): TokenBucket => {
    if (bucketOrFactory instanceof TokenBucket) return bucketOrFactory;
    const key = url.origin;
    let bucket = memo.get(key);
    if (!bucket) {
      bucket = bucketOrFactory({ origin: key, url });
      memo.set(key, bucket);
    }
    return bucket;
  };

  const wrapped: typeof globalThis.fetch = async (input, init) => {
    const url = toUrl(input);
    if (url) {
      const bucket = resolveBucket(url);
      await bucket.take(1);
    }
    return fetchFn(input, init);
  };

  return wrapped;
}

function toUrl(input: Parameters<typeof globalThis.fetch>[0]): URL | null {
  try {
    if (input instanceof URL) return input;
    if (typeof input === 'string') return new URL(input);
    const maybeRequest = input as { url?: unknown };
    if (typeof maybeRequest.url === 'string') return new URL(maybeRequest.url);
  } catch {
    return null;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
