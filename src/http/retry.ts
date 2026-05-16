/**
 * HTTP retry primitive — wraps a fetch-shaped function with exponential
 * backoff. Compose at the call site:
 *
 *   const adapter = new ShopifyAdapter({
 *     store: 'demo',
 *     storefrontAccessToken: token,
 *     fetch: withRetry(globalThis.fetch),
 *   });
 *
 * Pair with `withRateLimit` and `createHttpClient` from this directory.
 */

export interface RetryOptions {
  /** Maximum total attempts including the first try. Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms used as the initial backoff. Default: 200. */
  baseDelayMs?: number;
  /** Cap on per-attempt delay in ms. Default: 5000. */
  maxDelayMs?: number;
  /** Add random jitter ± 50% of the computed delay. Default: true. */
  jitter?: boolean;
  /** HTTP status codes that trigger a retry. Default: 408, 429, 502, 503, 504. */
  retryableStatuses?: number[];
  /** Custom predicate; if provided, fully replaces the status-code check. */
  shouldRetry?: (response: Response | null, error: unknown, attempt: number) => boolean;
  /** Hook for tests / observability. */
  onRetry?: (info: { attempt: number; delayMs: number; status?: number; error?: unknown }) => void;
}

const DEFAULT_RETRYABLE_STATUSES = [408, 429, 502, 503, 504];

export function withRetry(
  fetchFn: typeof globalThis.fetch,
  options: RetryOptions = {}
): typeof globalThis.fetch {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const jitter = options.jitter ?? true;
  const retryableStatuses = options.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  const isRetryable = (response: Response | null, error: unknown, attempt: number): boolean => {
    if (options.shouldRetry) return options.shouldRetry(response, error, attempt);
    if (error) return true; // network-level error
    if (response && retryableStatuses.includes(response.status)) return true;
    return false;
  };

  const wrapped: typeof globalThis.fetch = async (input, init) => {
    let lastError: unknown;
    let lastResponse: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastError = undefined;
      lastResponse = null;
      try {
        const response = await fetchFn(input, init);
        if (response.ok || attempt === maxAttempts || !isRetryable(response, null, attempt)) {
          return response;
        }
        lastResponse = response;
      } catch (err) {
        lastError = err;
        if (attempt === maxAttempts || !isRetryable(null, err, attempt)) {
          throw err;
        }
      }

      const delayMs = computeDelay({
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitter,
        retryAfterHeader: lastResponse?.headers.get('retry-after') ?? null,
      });

      options.onRetry?.({
        attempt,
        delayMs,
        status: lastResponse?.status,
        error: lastError,
      });

      await sleep(delayMs);
    }

    if (lastResponse) return lastResponse;
    throw lastError ?? new Error('withRetry: exhausted attempts without a response');
  };

  return wrapped;
}

function computeDelay(args: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryAfterHeader: string | null;
}): number {
  const retryAfterMs = parseRetryAfter(args.retryAfterHeader);
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, args.maxDelayMs);
  }

  const exponential = args.baseDelayMs * Math.pow(2, args.attempt - 1);
  const capped = Math.min(exponential, args.maxDelayMs);
  if (!args.jitter) return capped;
  const jitterFactor = 0.5 + Math.random();
  return Math.min(Math.round(capped * jitterFactor), args.maxDelayMs);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
