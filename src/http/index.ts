/**
 * Composable HTTP primitives for agorio adapters and clients.
 *
 * `createHttpClient` stacks rate-limit (outer) over retry (inner) over the
 * supplied base fetch. The returned function has the same signature as
 * `globalThis.fetch` and drops directly into any adapter's `fetch:` option.
 *
 *   import { createHttpClient, TokenBucket } from '@agorio/sdk';
 *
 *   const client = createHttpClient({
 *     retry: { maxAttempts: 4 },
 *     rateLimit: new TokenBucket({ capacity: 2, refillPerSec: 2 }),
 *   });
 *
 *   const shopify = new ShopifyAdapter({ store, storefrontAccessToken, fetch: client });
 */

export { withRetry } from './retry.js';
export type { RetryOptions } from './retry.js';

export { withRateLimit, TokenBucket } from './rate-limit.js';
export type { TokenBucketOptions, BucketFactory, RateLimitBucketContext } from './rate-limit.js';

import { withRetry, type RetryOptions } from './retry.js';
import { withRateLimit, type BucketFactory } from './rate-limit.js';

export interface HttpClientOptions {
  /** Base fetch to wrap. Default: globalThis.fetch (bound). */
  fetch?: typeof globalThis.fetch;
  /** Enable retry — pass `true` for defaults or an options object. */
  retry?: boolean | RetryOptions;
  /** Enable rate-limit — pass a TokenBucket instance or a per-origin factory. */
  rateLimit?: BucketFactory;
}

export function createHttpClient(options: HttpClientOptions = {}): typeof globalThis.fetch {
  const base = options.fetch ?? globalThis.fetch.bind(globalThis);

  let fn: typeof globalThis.fetch = base;

  if (options.retry) {
    fn = withRetry(fn, options.retry === true ? {} : options.retry);
  }

  if (options.rateLimit) {
    fn = withRateLimit(fn, options.rateLimit);
  }

  return fn;
}
