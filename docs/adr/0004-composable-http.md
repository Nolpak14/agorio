# 0004 — Composable HTTP primitives instead of an internal client

**Date:** 2026-05-03
**Status:** Accepted

## Context

Every adapter (Shopify, WooCommerce, BigCommerce, the AP2 client) needs retry, rate-limit, and
sometimes per-origin throttling. The naive options were:

1. Build a `HttpClient` class that all adapters extend.
2. Ship a hard dependency on `undici` / `ky` / `axios`.

Both feel wrong. Adapters want to keep their own `fetch:` injection point for testing, and we
don't want to pull a third-party HTTP lib into the SDK runtime when the platform already has
`fetch`.

## Decision

Ship `createHttpClient({ retry?, rateLimit? })` and the underlying `withRetry` / `withRateLimit`
helpers in `src/http/`. They each take a `fetch`-shaped function and return a `fetch`-shaped
function. Compose by passing the result to any adapter's `fetch:` option.

```ts
const fetchFn = createHttpClient({
  retry: { maxRetries: 3 },
  rateLimit: { capacity: 10, refillPerSec: 5 },
});

const shopify = new ShopifyAdapter({ ..., fetch: fetchFn });
```

## Consequences

- Zero new constructor params on existing adapters.
- Trivially testable — every helper has the same shape as `globalThis.fetch`.
- Customers can drop in their own retry policy at the same point — same shape.
- We can't add retry semantics that need to inspect adapter-specific state (e.g. Shopify's
  `Retry-After` header is parsed inside `withRetry`, but anything beyond `Retry-After` would
  require an adapter-aware option). So far, no need.
