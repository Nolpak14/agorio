/**
 * Tests for BigCommerceAdapter — BigCommerce v3 API integration
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BigCommerceAdapter,
  BigCommerceAdapterError,
  isBigCommerceStore,
} from '../src/adapters/bigcommerce.js';

type MockFetch = typeof globalThis.fetch;

function makeOkFetch(body: unknown): MockFetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map(),
  })) as unknown as MockFetch;
}

function makeErrorFetch(status = 401, message = 'Unauthorized'): MockFetch {
  return vi.fn(async () => ({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ status, title: message, type: 'about:blank' }),
    text: async () => JSON.stringify({ status, title: message }),
    headers: new Map(),
  })) as unknown as MockFetch;
}

function makeSequentialFetch(responses: Array<{ ok: boolean; body: unknown; status?: number }>): MockFetch {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++] ?? { ok: false, body: {} };
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      statusText: r.ok ? 'OK' : 'Error',
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
      headers: new Map(),
    };
  }) as unknown as MockFetch;
}

const bcProduct = (id: number, overrides: Partial<{
  name: string;
  price: number;
  sale_price: number;
  inventory_level: number;
  inventory_tracking: 'none' | 'product' | 'variant';
  availability: 'available' | 'disabled' | 'preorder';
  images: Array<{ url_standard: string; is_thumbnail?: boolean }>;
  variants: Array<{ id: number; sku: string; option_values?: Array<{ label: string; option_display_name: string }> }>;
}> = {}): object => ({
  id,
  name: overrides.name ?? `Product ${id}`,
  type: 'physical',
  sku: `sku-${id}`,
  description: `<p>Description for product ${id}</p>`,
  price: overrides.price ?? 19.99,
  sale_price: overrides.sale_price ?? 0,
  inventory_level: overrides.inventory_level ?? 10,
  inventory_tracking: overrides.inventory_tracking ?? 'product',
  is_visible: true,
  categories: [1],
  custom_url: { url: `/product-${id}/` },
  images: overrides.images ?? [{ url_standard: 'https://cdn.bigcommerce.com/img.jpg', is_thumbnail: true }],
  variants: overrides.variants,
  availability: overrides.availability ?? 'available',
});

function envelope<T>(data: T, total?: number) {
  return { data, meta: { pagination: { total: total ?? (Array.isArray(data) ? data.length : 1) } } };
}

function adapter(fetchFn: MockFetch, opts: { withAuth?: boolean } = {}) {
  return new BigCommerceAdapter({
    storeHash: 'abc123',
    ...(opts.withAuth ? { accessToken: 'token-xyz' } : {}),
    fetch: fetchFn,
  });
}

describe('BigCommerceAdapter', () => {
  it('should require storeHash', () => {
    expect(() => new BigCommerceAdapter({ storeHash: '' })).toThrow(BigCommerceAdapterError);
  });

  it('should report adapter type and computed domain', () => {
    const a = adapter(makeOkFetch(envelope([])));
    expect(a.adapterType).toBe('bigcommerce');
    expect(a.domain).toBe('store-abc123.mybigcommerce.com');
  });

  it('should match the canonical mybigcommerce.com domain', () => {
    const a = adapter(makeOkFetch(envelope([])));
    expect(a.matchesDomain('store-abc123.mybigcommerce.com')).toBe(true);
    expect(a.matchesDomain('https://store-abc123.mybigcommerce.com/')).toBe(true);
    expect(a.matchesDomain('store-other.mybigcommerce.com')).toBe(false);
  });

  it('should accept a custom storefront domain', () => {
    const a = new BigCommerceAdapter({
      storeHash: 'abc123',
      domain: 'shop.example.com',
      fetch: makeOkFetch(envelope([])),
    });
    expect(a.domain).toBe('shop.example.com');
    expect(a.matchesDomain('shop.example.com')).toBe(true);
    // Always also matches the canonical fallback
    expect(a.matchesDomain('store-abc123.mybigcommerce.com')).toBe(true);
  });

  it('should discover and advertise read-only capabilities without auth', async () => {
    const a = adapter(makeOkFetch(envelope({ inventory_count: 42, primary_currency_code: 'USD' })));
    const res = await a.discover('store-abc123.mybigcommerce.com');
    expect(res.protocol).toBe('adapter');
    expect(res.adapterType).toBe('bigcommerce');
    expect(res.capabilities).toContain('products.list');
    expect(res.capabilities).not.toContain('checkout.create');
  });

  it('should advertise checkout capabilities when authenticated', async () => {
    const a = adapter(
      makeOkFetch(envelope({ inventory_count: 42, primary_currency_code: 'USD' })),
      { withAuth: true }
    );
    const res = await a.discover('store-abc123.mybigcommerce.com');
    expect(res.capabilities).toContain('checkout.create');
    expect(res.capabilities).toContain('checkout.complete');
  });

  it('should list products', async () => {
    const products = [bcProduct(1), bcProduct(2), bcProduct(3)];
    const a = adapter(makeOkFetch(envelope(products, 25)));
    const result = await a.listProducts({ limit: 3 });

    expect(result.products).toHaveLength(3);
    expect(result.products[0].id).toBe('1');
    expect(result.products[0].name).toBe('Product 1');
    expect(result.products[0].price.amount).toBe('19.99');
    expect(result.products[0].price.currency).toBe('USD');
    expect(result.products[0].inStock).toBe(true);
    expect(result.total).toBe(25);
  });

  it('should treat inventory_tracking="none" as in stock regardless of level', async () => {
    const products = [bcProduct(1, { inventory_tracking: 'none', inventory_level: 0 })];
    const a = adapter(makeOkFetch(envelope(products)));
    const result = await a.listProducts();
    expect(result.products[0].inStock).toBe(true);
  });

  it('should mark zero-stock tracked products as out of stock', async () => {
    const products = [bcProduct(2, { inventory_tracking: 'product', inventory_level: 0 })];
    const a = adapter(makeOkFetch(envelope(products)));
    const result = await a.listProducts();
    expect(result.products[0].inStock).toBe(false);
  });

  it('should prefer sale_price when present', async () => {
    const products = [bcProduct(3, { price: 49.99, sale_price: 29.99 })];
    const a = adapter(makeOkFetch(envelope(products)));
    const result = await a.listProducts();
    expect(result.products[0].price.amount).toBe('29.99');
  });

  it('should expose multiple variants', async () => {
    const products = [bcProduct(4, {
      variants: [
        { id: 91, sku: 's', option_values: [{ label: 'Small', option_display_name: 'Size' }] },
        { id: 92, sku: 'm', option_values: [{ label: 'Medium', option_display_name: 'Size' }] },
      ],
    })];
    const a = adapter(makeOkFetch(envelope(products)));
    const result = await a.listProducts();
    expect(result.products[0].variants).toHaveLength(2);
    expect(result.products[0].variants![0].name).toContain('Size: Small');
  });

  it('should strip HTML from descriptions', async () => {
    const products = [bcProduct(5)];
    const a = adapter(makeOkFetch(envelope(products)));
    const result = await a.listProducts();
    expect(result.products[0].description).toBe('Description for product 5');
  });

  it('should pass the search keyword in the URL', async () => {
    const fetchFn = makeOkFetch(envelope([bcProduct(7, { name: 'Running Shoes' })]));
    const a = adapter(fetchFn);
    await a.searchProducts('running shoes', 5);
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('keyword=running+shoes');
    expect(url).toContain('limit=5');
  });

  it('should fetch a product by id', async () => {
    const fetchFn = makeOkFetch(envelope(bcProduct(42, { name: 'Special Item', price: 99.99 })));
    const a = adapter(fetchFn);
    const result = await a.getProduct('42');
    expect(result.id).toBe('42');
    expect(result.name).toBe('Special Item');
    expect(result.price.amount).toBe('99.99');
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/catalog/products/42');
  });

  it('should throw on HTTP errors', async () => {
    const a = adapter(makeErrorFetch(401));
    await expect(a.listProducts()).rejects.toThrow(BigCommerceAdapterError);
    await expect(a.listProducts()).rejects.toThrow('401');
  });

  it('should refuse checkout without auth', async () => {
    const a = adapter(makeOkFetch(envelope({})));
    await expect(
      a.createCheckout([{ productId: '1', quantity: 1 }])
    ).rejects.toThrow('accessToken');
  });

  it('should create a cart with auth and return totals', async () => {
    const cartResponse = envelope({
      id: 'cart_555',
      currency: { code: 'USD' },
      cart_amount: 59.98,
      base_amount: 59.98,
      line_items: { physical_items: [{ id: 'li_1', product_id: 1, quantity: 2 }] },
    });
    const a = adapter(makeOkFetch(cartResponse), { withAuth: true });
    const result = await a.createCheckout([{ productId: '1', quantity: 2 }]);
    expect(result.sessionId).toBe('cart_555');
    expect(result.totals.total.amount).toBe('59.98');
    expect(result.totals.total.currency).toBe('USD');
  });

  it('should complete a checkout end-to-end', async () => {
    const fetchFn = makeSequentialFetch([
      { ok: true, body: {} },                              // PUT billing-address
      { ok: true, body: envelope({ id: 4242 }) },          // POST orders
      { ok: true, body: envelope({ id: 4242, status: 'pending', total_inc_tax: '59.98', currency_code: 'USD' }) }, // GET order
    ]);
    const a = adapter(fetchFn, { withAuth: true });
    const result = await a.completeCheckout(
      'cart_555',
      { method: 'card', token: 'tok_test' },
      {
        name: 'Test Agent',
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      }
    );
    expect(result.orderId).toBe('4242');
    expect(result.status).toBe('pending');
  });
});

describe('isBigCommerceStore', () => {
  it('detects canonical mybigcommerce.com domains', () => {
    expect(isBigCommerceStore('store-abc123.mybigcommerce.com')).toBe(true);
    expect(isBigCommerceStore('https://store-xyz.mybigcommerce.com/')).toBe(true);
  });

  it('rejects unrelated domains', () => {
    expect(isBigCommerceStore('example.com')).toBe(false);
    expect(isBigCommerceStore('shop.shopify.com')).toBe(false);
  });
});
