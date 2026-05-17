# Adapter SDK

How to build a merchant adapter and publish it as `@your-merchant/agorio-adapter` (or any
package name — the registry is informal).

## The `MerchantAdapter` contract

An adapter is any object that implements the `MerchantAdapter` interface from `@agorio/sdk`.
The shape is small and intentionally fetch-based so adapters compose with `createHttpClient()`
for retry + rate-limit.

```ts
import type { MerchantAdapter, MerchantAdapterDiscovery, MockProduct, CartItem, ShippingAddress } from '@agorio/sdk';

export class MyMerchantAdapter implements MerchantAdapter {
  readonly adapterType = 'my-merchant';

  async discover(domain: string): Promise<MerchantAdapterDiscovery> { /* ... */ }

  async listProducts(opts?: { page?: number; limit?: number; category?: string }) { /* ... */ }
  async searchProducts(query: string, limit?: number) { /* ... */ }
  async getProduct(productId: string): Promise<MockProduct> { /* ... */ }

  // Optional — only if your merchant supports purchase via the agent.
  async createCheckout?(items: CartItem[]) { /* ... */ }
  async completeCheckout?(sessionId: string, payment: { method: string; token?: string }, shippingAddress: ShippingAddress) { /* ... */ }

  // Optional — domain matching for auto-routing in ShoppingAgent.
  matchesDomain?(domain: string): boolean { /* ... */ }
}
```

Look at the reference implementations to copy the boilerplate:

- `src/adapters/shopify.ts` — Storefront API + UCP auto-detection
- `src/adapters/woocommerce.ts` — REST API v3, HMAC for writes
- `src/adapters/bigcommerce.ts` — v3 catalog + cart + checkout

## Required capabilities

Your `discover()` response must list the `capabilities[]` array your adapter actually supports.
The agent inspects this to decide which tools to expose. Standard values:

- `products.list`
- `products.search`
- `products.get`
- `products.reviews` (optional — implement `getProductReviews?`)
- `checkout.create`
- `checkout.complete`
- `orders.track`

If your merchant doesn't support purchase, leave the checkout methods unimplemented and omit
the `checkout.*` capabilities. The agent will still happily browse and recommend.

## Auth and `fetch:` injection

Always accept a `fetch:` option in your constructor and default it to `globalThis.fetch`. This
lets customers compose your adapter with `createHttpClient({ retry, rateLimit })` from the SDK
and lets tests inject mock fetches without monkey-patching globals.

```ts
constructor(options: MyMerchantAdapterOptions) {
  this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
}
```

For auth, prefer:

- Bearer tokens (simplest, works everywhere)
- HMAC with consumer-key/secret (Shopify, WooCommerce)
- API account tokens (BigCommerce)

Document the **minimum scopes** required in your README.

## Testing

Mirror `tests/<your-adapter>.test.ts` against one of the existing adapter tests. Use the
`vi.fn(...)` fetch-mock pattern so tests run without network. Aim for ≥ 15 test cases covering:

- Construction (required vs optional options)
- `adapterType` and `domain` accessors
- `discover()` happy path + auth-rejected path
- `listProducts` / `searchProducts` / `getProduct` with realistic API payloads
- In-stock detection, sale price handling, variant handling
- Checkout create + complete (auth required path)
- HTTP error mapping

## Publishing

Name your package however you like — there is no official `@agorio/adapter-*` namespace and
nothing prevents `@your-merchant/agorio-adapter`. Recommended `package.json`:

```json
{
  "name": "@your-merchant/agorio-adapter",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@agorio/sdk": "^1.0.0"
  },
  "files": ["dist/", "README.md", "LICENSE"]
}
```

## Listing on the registry

We maintain a simple registry at `docs/adapters-registry.md` in the agorio repo. Open a PR
adding your adapter with:

- Package name + repo URL
- Maintainer contact
- Supported capabilities
- Confirmation that it passes `npm audit` clean

See [community plugins program](./community-plugins.md) for the analogous process for
governance plugins.
