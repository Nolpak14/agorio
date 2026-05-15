/**
 * Tests for WooCommerceAdapter — WooCommerce REST API v3 integration
 */

import { describe, it, expect, vi } from 'vitest';
import { WooCommerceAdapter, WooCommerceAdapterError, isWooCommerceStore } from '../src/adapters/woocommerce.js';

type MockFetch = typeof globalThis.fetch;

function makeOkFetch(body: unknown): MockFetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map([['content-type', 'application/json']]),
  })) as unknown as MockFetch;
}

function makeErrorFetch(status = 401, message = 'Unauthorized'): MockFetch {
  return vi.fn(async () => ({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ code: 'woocommerce_rest_cannot_view', message }),
    text: async () => JSON.stringify({ code: 'woocommerce_rest_cannot_view', message }),
    headers: new Map([['content-type', 'application/json']]),
  })) as unknown as MockFetch;
}

function makeSequentialFetch(responses: Array<{ ok: boolean; body: unknown }>): MockFetch {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++] ?? { ok: false, body: {} };
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      statusText: r.ok ? 'OK' : 'Internal Server Error',
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
      headers: new Map([['content-type', 'application/json']]),
    };
  }) as unknown as MockFetch;
}

function createAdapter(fetchFn: MockFetch, opts: { withAuth?: boolean } = {}) {
  return new WooCommerceAdapter({
    url: 'https://test-store.com',
    ...(opts.withAuth ? { consumerKey: 'ck_test', consumerSecret: 'cs_test' } : {}),
    fetch: fetchFn,
  });
}

const wcProduct = (id: number, overrides: Partial<{
  name: string;
  price: string;
  stock_status: 'instock' | 'outofstock';
  categories: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; name: string; alt: string }>;
  type: 'simple' | 'variable';
  variations: number[];
}> = {}): object => ({
  id,
  name: overrides.name ?? `Product ${id}`,
  status: 'publish',
  description: `<p>Description for product ${id}</p>`,
  short_description: `Short description ${id}`,
  sku: `sku-${id}`,
  price: overrides.price ?? '29.99',
  regular_price: overrides.price ?? '29.99',
  sale_price: '',
  stock_status: overrides.stock_status ?? 'instock',
  manage_stock: false,
  stock_quantity: null,
  categories: overrides.categories ?? [{ id: 9, name: 'Clothing', slug: 'clothing' }],
  images: overrides.images ?? [{ id: 10, src: 'https://cdn.example.com/img.jpg', name: 'image', alt: '' }],
  attributes: [],
  variations: overrides.variations ?? [],
  type: overrides.type ?? 'simple',
  permalink: `https://test-store.com/product/${id}`,
});

describe('WooCommerceAdapter', () => {
  it('should have correct adapter type', () => {
    const adapter = createAdapter(makeOkFetch([]));
    expect(adapter.adapterType).toBe('woocommerce');
  });

  it('should compute domain from store URL', () => {
    const adapter = createAdapter(makeOkFetch([]));
    expect(adapter.domain).toBe('test-store.com');
  });

  it('should strip trailing slash from store URL', () => {
    const adapter = new WooCommerceAdapter({
      url: 'https://test-store.com/',
      fetch: makeOkFetch([]),
    });
    expect(adapter.domain).toBe('test-store.com');
  });

  it('should match domain correctly', () => {
    const adapter = createAdapter(makeOkFetch([]));
    expect(adapter.matchesDomain('test-store.com')).toBe(true);
    expect(adapter.matchesDomain('https://test-store.com')).toBe(true);
    expect(adapter.matchesDomain('other-store.com')).toBe(false);
  });

  it('should discover a WooCommerce store', async () => {
    const settingsResponse = { blogname: 'My WooCommerce Store' };
    const adapter = createAdapter(makeOkFetch(settingsResponse));
    const result = await adapter.discover('test-store.com');

    expect(result.domain).toBe('test-store.com');
    expect(result.protocol).toBe('adapter');
    expect(result.adapterType).toBe('woocommerce');
    expect(result.capabilities).toContain('products.list');
    expect(result.capabilities).toContain('products.search');
    expect(result.capabilities).toContain('checkout.create');
  });

  it('should list products', async () => {
    const products = [wcProduct(1), wcProduct(2), wcProduct(3)];
    const adapter = createAdapter(makeOkFetch(products));
    const result = await adapter.listProducts({ limit: 3 });

    expect(result.products).toHaveLength(3);
    expect(result.products[0].id).toBe('1');
    expect(result.products[0].name).toBe('Product 1');
    expect(result.products[0].price.amount).toBe('29.99');
    expect(result.products[0].price.currency).toBe('USD');
    expect(result.products[0].inStock).toBe(true);
    expect(result.products[0].category).toBe('Clothing');
  });

  it('should mark out-of-stock products correctly', async () => {
    const products = [wcProduct(5, { stock_status: 'outofstock' })];
    const adapter = createAdapter(makeOkFetch(products));
    const result = await adapter.listProducts();

    expect(result.products[0].inStock).toBe(false);
  });

  it('should include image URLs in products', async () => {
    const products = [wcProduct(1)];
    const adapter = createAdapter(makeOkFetch(products));
    const result = await adapter.listProducts();

    expect(result.products[0].imageUrl).toBe('https://cdn.example.com/img.jpg');
  });

  it('should list product variants for variable products', async () => {
    const products = [wcProduct(1, { type: 'variable', variations: [101, 102, 103] })];
    const adapter = createAdapter(makeOkFetch(products));
    const result = await adapter.listProducts();

    expect(result.products[0].variants).toHaveLength(3);
    expect(result.products[0].variants![0].id).toBe('101');
  });

  it('should search products', async () => {
    const products = [wcProduct(7, { name: 'Running Shoes' })];
    const adapter = createAdapter(makeOkFetch(products));
    const result = await adapter.searchProducts('running shoes', 5);

    expect(result.query).toBe('running shoes');
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Running Shoes');

    const callUrl = (adapter as unknown as { fetchFn: ReturnType<typeof vi.fn> }).fetchFn
      ?? (makeOkFetch(products) as ReturnType<typeof vi.fn>);
    // URL was called with search param — verified via fetch mock
  });

  it('should pass search query in request URL', async () => {
    const fetchFn = makeOkFetch([wcProduct(1)]);
    const adapter = new WooCommerceAdapter({
      url: 'https://test-store.com',
      fetch: fetchFn,
    });

    await adapter.searchProducts('laptop', 10);

    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=laptop');
  });

  it('should get a single product by ID', async () => {
    const product = wcProduct(42, { name: 'Special Item', price: '99.99' });
    const adapter = createAdapter(makeOkFetch(product));
    const result = await adapter.getProduct('42');

    expect(result.id).toBe('42');
    expect(result.name).toBe('Special Item');
    expect(result.price.amount).toBe('99.99');
  });

  it('should throw WooCommerceAdapterError on HTTP error', async () => {
    const adapter = createAdapter(makeErrorFetch(401));
    await expect(adapter.listProducts()).rejects.toThrow(WooCommerceAdapterError);
    await expect(adapter.listProducts()).rejects.toThrow('401');
  });

  it('should throw on checkout without credentials', async () => {
    const adapter = createAdapter(makeOkFetch({}));
    await expect(
      adapter.createCheckout([{ productId: '1', quantity: 1 }])
    ).rejects.toThrow('consumerKey and consumerSecret');
  });

  it('should create a checkout order with credentials', async () => {
    const orderResponse = {
      id: 555,
      status: 'pending',
      total: '59.98',
      currency: 'USD',
      line_items: [{ product_id: 1, quantity: 2, total: '59.98' }],
      billing: {},
    };
    const fetchFn = makeOkFetch(orderResponse);
    const adapter = createAdapter(fetchFn, { withAuth: true });

    const result = await adapter.createCheckout([{ productId: '1', quantity: 2 }]);

    expect(result.sessionId).toBe('555');
    expect(result.totals.total.amount).toBe('59.98');
    expect(result.totals.total.currency).toBe('USD');
  });
});

describe('isWooCommerceStore', () => {
  it('should return true for a WooCommerce store', async () => {
    const fetchFn = makeOkFetch([wcProduct(1)]);
    const result = await isWooCommerceStore('example.com', fetchFn);
    expect(result).toBe(true);
  });

  it('should return false when store is not WooCommerce', async () => {
    const fetchFn = makeErrorFetch(404);
    const result = await isWooCommerceStore('non-wc.com', fetchFn);
    expect(result).toBe(false);
  });

  it('should return false on network error', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Network error'); }) as unknown as MockFetch;
    const result = await isWooCommerceStore('unreachable.com', fetchFn);
    expect(result).toBe(false);
  });
});
