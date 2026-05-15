/**
 * Tests for Shopify UCP migration compatibility (#41)
 *
 * Shopify migrated from MCP to UCP on May 30, 2026. Stores now expose
 * /.well-known/ucp in addition to (or instead of) the Storefront API.
 * The adapter should prefer UCP discovery and fall back gracefully.
 */

import { describe, it, expect, vi } from 'vitest';
import { ShopifyAdapter } from '../src/adapters/shopify.js';
import ucpFixture from './fixtures/shopify-ucp-profile.json';

type MockFetchFn = typeof globalThis.fetch;

function makeJsonFetch(body: unknown, ok = true): MockFetchFn {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map([['content-type', 'application/json']]),
  })) as unknown as MockFetchFn;
}

function makeSequentialFetch(responses: Array<{ ok: boolean; body: unknown }>): MockFetchFn {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++] ?? { ok: false, body: {} };
    return {
      ok: r.ok,
      status: r.ok ? 200 : 404,
      statusText: r.ok ? 'OK' : 'Not Found',
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
      headers: new Map([['content-type', 'application/json']]),
    };
  }) as unknown as MockFetchFn;
}

function shopifyGraphqlResponse(shopName: string) {
  return {
    data: {
      shop: { name: shopName, description: 'Test shop' },
      products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }] },
    },
  };
}

describe('Shopify UCP migration compatibility', () => {
  it('should prefer UCP discovery for *.myshopify.com stores', async () => {
    const fetchFn = makeJsonFetch(ucpFixture);

    const adapter = new ShopifyAdapter({
      store: 'example',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.discover('example.myshopify.com');

    expect(result.protocol).toBe('ucp');
    expect(result.domain).toBe('example.myshopify.com');
    expect(result.adapterType).toBe('shopify');
    expect(result.ucpProfile).toBeDefined();
  });

  it('should normalize UCP capabilities from array format', async () => {
    const fetchFn = makeJsonFetch(ucpFixture);

    const adapter = new ShopifyAdapter({
      store: 'example',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.discover('example.myshopify.com');

    expect(result.capabilities).toContain('dev.ucp.shopping.browse');
    expect(result.capabilities).toContain('dev.ucp.shopping.search');
    expect(result.capabilities).toContain('dev.ucp.shopping.cart');
    expect(result.capabilities).toContain('dev.ucp.shopping.checkout');
    expect(result.capabilities).toContain('dev.ucp.shopping.orders');
    expect(result.capabilities).toHaveLength(5);
  });

  it('should normalize UCP capabilities from object-keyed format', async () => {
    const objectKeyedFixture = {
      ucp: {
        version: '1.0',
        services: ucpFixture.ucp.services,
        capabilities: {
          'dev.ucp.shopping.browse': [{ version: '1.0', spec: 'https://ucp.dev/browse' }],
          'dev.ucp.shopping.search': [{ version: '1.0', spec: 'https://ucp.dev/search' }],
          'dev.ucp.shopping.checkout': [{ version: '1.0' }],
        },
      },
    };

    const fetchFn = makeJsonFetch(objectKeyedFixture);

    const adapter = new ShopifyAdapter({
      store: 'example',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.discover('example.myshopify.com');

    expect(result.protocol).toBe('ucp');
    expect(result.capabilities).toContain('dev.ucp.shopping.browse');
    expect(result.capabilities).toContain('dev.ucp.shopping.search');
    expect(result.capabilities).toContain('dev.ucp.shopping.checkout');
    expect(result.capabilities).toHaveLength(3);
  });

  it('should fall back to Storefront API when UCP returns 404', async () => {
    const fetchFn = makeSequentialFetch([
      { ok: false, body: '' },                           // /.well-known/ucp → 404
      { ok: true, body: shopifyGraphqlResponse('Acme Shop') }, // GraphQL shop query
    ]);

    const adapter = new ShopifyAdapter({
      store: 'acme',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.discover('acme.myshopify.com');

    expect(result.protocol).toBe('adapter');
    expect(result.name).toBe('Acme Shop');
    expect(result.capabilities).toContain('products.list');
    expect(result.ucpProfile).toBeUndefined();
  });

  it('should fall back when UCP response is missing the ucp root key', async () => {
    const malformedProfile = { version: '1.0', services: {} };  // no "ucp" key

    const fetchFn = makeSequentialFetch([
      { ok: true, body: malformedProfile },                       // /.well-known/ucp → malformed
      { ok: true, body: shopifyGraphqlResponse('Beta Store') },   // Storefront fallback
    ]);

    const adapter = new ShopifyAdapter({
      store: 'beta',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.discover('beta.myshopify.com');

    expect(result.protocol).toBe('adapter');
    expect(result.name).toBe('Beta Store');
  });

  it('should fall back when fetch throws a network error', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async (_url: string) => {
      calls++;
      if (calls === 1) throw new TypeError('Network error');
      return {
        ok: true,
        status: 200,
        json: async () => shopifyGraphqlResponse('Error Store'),
        text: async () => '',
        headers: new Map([['content-type', 'application/json']]),
      };
    }) as unknown as MockFetchFn;

    const adapter = new ShopifyAdapter({
      store: 'error-store',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.discover('error-store.myshopify.com');

    expect(result.protocol).toBe('adapter');
    expect(result.name).toBe('Error Store');
  });

  it('should skip UCP when preferUcp is false', async () => {
    const fetchFn = makeJsonFetch(shopifyGraphqlResponse('No UCP Store'));

    const adapter = new ShopifyAdapter({
      store: 'noucpstore',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
      preferUcp: false,
    });

    const result = await adapter.discover('noucpstore.myshopify.com');

    expect(result.protocol).toBe('adapter');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('well-known');
  });

  it('tryUcpDiscovery() returns null when UCP is not available', async () => {
    const fetchFn = makeJsonFetch({}, false);

    const adapter = new ShopifyAdapter({
      store: 'no-ucp',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.tryUcpDiscovery();
    expect(result).toBeNull();
  });

  it('tryUcpDiscovery() returns discovery result for valid UCP profile', async () => {
    const fetchFn = makeJsonFetch(ucpFixture);

    const adapter = new ShopifyAdapter({
      store: 'example',
      storefrontAccessToken: 'test-token',
      fetch: fetchFn,
    });

    const result = await adapter.tryUcpDiscovery();

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe('ucp');
    expect(result!.capabilities).toHaveLength(5);
    expect(result!.ucpProfile).toMatchObject({ ucp: { version: '1.0' } });
  });

  it('should not attempt UCP for custom domain stores', async () => {
    const fetchFn = makeJsonFetch(shopifyGraphqlResponse('Custom Domain Store'));

    const adapter = new ShopifyAdapter({
      store: 'my-store',
      storefrontAccessToken: 'test-token',
      customDomain: 'shop.example.com',
      fetch: fetchFn,
    });

    const result = await adapter.discover('shop.example.com');

    // Domain is shop.example.com, not *.myshopify.com — no UCP attempt
    expect(result.protocol).toBe('adapter');
    expect(result.name).toBe('Custom Domain Store');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('well-known');
  });
});
