/**
 * Tests for ShopifyAdapter - Shopify Storefront API integration
 */

import { describe, it, expect, vi } from 'vitest';
import { ShopifyAdapter, ShopifyAdapterError } from '../src/adapters/shopify.js';

/**
 * Create a mock fetch that returns specified GraphQL responses.
 */
function mockFetch(responses: Array<{ data: unknown; errors?: Array<{ message: string }> }>) {
  let callIndex = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const response = responses[callIndex++];
    if (!response) {
      return { ok: false, status: 500, statusText: 'No more responses', text: async () => 'Mock exhausted' } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
      headers: new Map([['content-type', 'application/json']]),
    } as unknown as Response;
  });
}

function createAdapter(fetchFn: ReturnType<typeof mockFetch>) {
  return new ShopifyAdapter({
    store: 'test-store',
    storefrontAccessToken: 'test-token',
    fetch: fetchFn as unknown as typeof globalThis.fetch,
  });
}

describe('ShopifyAdapter', () => {
  it('should have correct adapter type', () => {
    const adapter = createAdapter(mockFetch([]));
    expect(adapter.adapterType).toBe('shopify');
  });

  it('should compute domain from store handle', () => {
    const adapter = createAdapter(mockFetch([]));
    expect(adapter.domain).toBe('test-store.myshopify.com');
  });

  it('should use custom domain if provided', () => {
    const fetchFn = mockFetch([]);
    const adapter = new ShopifyAdapter({
      store: 'test-store',
      storefrontAccessToken: 'test-token',
      customDomain: 'shop.example.com',
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    expect(adapter.domain).toBe('shop.example.com');
  });

  it('should match domain correctly', () => {
    const adapter = createAdapter(mockFetch([]));
    expect(adapter.matchesDomain('test-store.myshopify.com')).toBe(true);
    expect(adapter.matchesDomain('test-store')).toBe(true);
    expect(adapter.matchesDomain('https://test-store.myshopify.com')).toBe(true);
    expect(adapter.matchesDomain('other-store.myshopify.com')).toBe(false);
  });

  it('should discover a Shopify store', async () => {
    const fetchFn = mockFetch([{
      data: {
        shop: { name: 'Test Shop', description: 'A test shop' },
        products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }] },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    const result = await adapter.discover('test-store.myshopify.com');

    expect(result.domain).toBe('test-store.myshopify.com');
    expect(result.name).toBe('Test Shop');
    expect(result.protocol).toBe('adapter');
    expect(result.adapterType).toBe('shopify');
    expect(result.capabilities).toContain('products.list');
  });

  it('should list products', async () => {
    const fetchFn = mockFetch([{
      data: {
        products: {
          edges: [
            {
              node: {
                id: 'gid://shopify/Product/123',
                title: 'Test Shirt',
                description: 'A nice shirt',
                productType: 'Apparel',
                availableForSale: true,
                featuredImage: { url: 'https://cdn.shopify.com/image.jpg' },
                priceRange: { minVariantPrice: { amount: '29.99', currencyCode: 'USD' } },
                variants: {
                  edges: [{
                    node: {
                      id: 'gid://shopify/ProductVariant/456',
                      title: 'Medium',
                      availableForSale: true,
                      price: { amount: '29.99', currencyCode: 'USD' },
                    },
                  }],
                },
              },
              cursor: 'abc',
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    const result = await adapter.listProducts({ limit: 10 });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe('123');
    expect(result.products[0].name).toBe('Test Shirt');
    expect(result.products[0].price.amount).toBe('29.99');
    expect(result.products[0].price.currency).toBe('USD');
    expect(result.products[0].category).toBe('Apparel');
    expect(result.products[0].inStock).toBe(true);
    expect(result.products[0].variants).toHaveLength(1);
    expect(result.products[0].variants![0].name).toBe('Medium');
  });

  it('should search products', async () => {
    const fetchFn = mockFetch([{
      data: {
        products: {
          edges: [{
            node: {
              id: 'gid://shopify/Product/789',
              title: 'Running Shoes',
              description: 'Fast shoes',
              productType: 'Footwear',
              availableForSale: true,
              featuredImage: null,
              priceRange: { minVariantPrice: { amount: '89.99', currencyCode: 'USD' } },
              variants: { edges: [] },
            },
            cursor: 'xyz',
          }],
        },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    const result = await adapter.searchProducts('shoes', 5);

    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Running Shoes');
    expect(result.query).toBe('shoes');
  });

  it('should get a single product', async () => {
    const fetchFn = mockFetch([{
      data: {
        product: {
          id: 'gid://shopify/Product/123',
          title: 'Test Product',
          description: 'Description here',
          productType: 'Electronics',
          availableForSale: true,
          featuredImage: { url: 'https://cdn.shopify.com/img.jpg' },
          priceRange: { minVariantPrice: { amount: '49.99', currencyCode: 'USD' } },
          variants: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/ProductVariant/100',
                  title: 'Default',
                  availableForSale: true,
                  price: { amount: '49.99', currencyCode: 'USD' },
                },
              },
            ],
          },
        },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    const product = await adapter.getProduct('123');

    expect(product.id).toBe('123');
    expect(product.name).toBe('Test Product');
    expect(product.price.amount).toBe('49.99');
  });

  it('should throw on product not found', async () => {
    const fetchFn = mockFetch([{
      data: { product: null },
    }]);

    const adapter = createAdapter(fetchFn);
    await expect(adapter.getProduct('nonexistent')).rejects.toThrow(ShopifyAdapterError);
  });

  it('should handle GraphQL errors', async () => {
    const fetchFn = mockFetch([{
      data: {},
      errors: [{ message: 'Access denied' }],
    }]);

    const adapter = createAdapter(fetchFn);
    await expect(adapter.discover('test')).rejects.toThrow('Shopify GraphQL error: Access denied');
  });

  it('should handle HTTP errors', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid token',
    })) as unknown as typeof globalThis.fetch;

    const adapter = new ShopifyAdapter({
      store: 'test-store',
      storefrontAccessToken: 'bad-token',
      fetch: fetchFn,
    });

    await expect(adapter.discover('test')).rejects.toThrow('Shopify API error: 401');
  });

  it('should send correct headers', async () => {
    const fetchFn = mockFetch([{
      data: {
        shop: { name: 'Test', description: '' },
        products: { edges: [] },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    await adapter.discover('test');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://test-store.myshopify.com/api/2024-10/graphql.json');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual(expect.objectContaining({
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': 'test-token',
    }));
  });

  it('should create checkout cart', async () => {
    const fetchFn = mockFetch([{
      data: {
        cartCreate: {
          cart: {
            id: 'gid://shopify/Cart/abc123',
            checkoutUrl: 'https://test-store.myshopify.com/cart/c/abc123',
            cost: {
              subtotalAmount: { amount: '29.99', currencyCode: 'USD' },
              totalAmount: { amount: '29.99', currencyCode: 'USD' },
            },
          },
          userErrors: [],
        },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    const result = await adapter.createCheckout([
      { productId: '123', name: 'Test', quantity: 1, price: { amount: '29.99', currency: 'USD' } },
    ]);

    expect(result.sessionId).toBe('gid://shopify/Cart/abc123');
    expect(result.totals.subtotal.amount).toBe('29.99');
    expect(result.checkoutUrl).toContain('test-store.myshopify.com');
  });

  it('should throw on completeCheckout (not supported)', async () => {
    const adapter = createAdapter(mockFetch([]));
    await expect(
      adapter.completeCheckout('sess_1', { method: 'card' }, {
        name: 'Test', line1: '123 St', city: 'SF', state: 'CA', postalCode: '94105', country: 'US',
      })
    ).rejects.toThrow('Shopify checkout must be completed via the checkout URL');
  });

  it('should extract numeric IDs from Shopify global IDs', async () => {
    const fetchFn = mockFetch([{
      data: {
        products: {
          edges: [{
            node: {
              id: 'gid://shopify/Product/987654321',
              title: 'Numbered Product',
              description: 'Test',
              productType: '',
              availableForSale: true,
              featuredImage: null,
              priceRange: { minVariantPrice: { amount: '10.00', currencyCode: 'USD' } },
              variants: { edges: [] },
            },
            cursor: 'a',
          }],
          pageInfo: { hasNextPage: false },
        },
      },
    }]);

    const adapter = createAdapter(fetchFn);
    const result = await adapter.listProducts();

    expect(result.products[0].id).toBe('987654321');
  });
});
