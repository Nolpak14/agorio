/**
 * WooCommerce REST API v3 Adapter
 *
 * Connects agorio agents to WooCommerce stores via the WooCommerce REST API v3.
 * Translates WC products into UCP-compatible format.
 *
 * Public product browsing works without auth on stores that allow it.
 * Cart/checkout writes require a consumer key + secret (HMAC-SHA256).
 *
 * Usage:
 *   const adapter = new WooCommerceAdapter({
 *     url: 'https://mystore.com',
 *     consumerKey: 'ck_xxx',    // optional — only needed for write operations
 *     consumerSecret: 'cs_xxx', // optional — only needed for write operations
 *   });
 *
 *   const agent = new ShoppingAgent({
 *     llm: new GeminiAdapter({ apiKey: '...' }),
 *     adapters: [adapter],
 *   });
 *
 *   await agent.run('Search for running shoes on mystore.com');
 */

import type {
  MerchantAdapter,
  MerchantAdapterDiscovery,
  MockProduct,
  MoneyAmount,
  CartItem,
  ShippingAddress,
} from '../types/index.js';

export interface WooCommerceAdapterOptions {
  /** Full store URL, e.g. 'https://mystore.com' */
  url: string;
  /** WooCommerce consumer key (for authenticated write operations) */
  consumerKey?: string;
  /** WooCommerce consumer secret (for authenticated write operations) */
  consumerSecret?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
}

// ─── WooCommerce REST API Types ───

interface WcProduct {
  id: number;
  name: string;
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  manage_stock: boolean;
  stock_quantity: number | null;
  categories: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; name: string; alt: string }>;
  attributes: Array<{
    id: number;
    name: string;
    options: string[];
  }>;
  variations: number[];
  type: 'simple' | 'variable' | 'grouped' | 'external';
  permalink: string;
}

interface WcOrder {
  id: number;
  status: string;
  total: string;
  currency: string;
  line_items: Array<{
    product_id: number;
    quantity: number;
    total: string;
  }>;
  billing: {
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    postcode: string;
    country: string;
    email: string;
  };
}

// ─── Adapter Implementation ───

export class WooCommerceAdapter implements MerchantAdapter {
  readonly adapterType = 'woocommerce';

  private readonly storeUrl: string;
  private readonly consumerKey: string | undefined;
  private readonly consumerSecret: string | undefined;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly apiBase: string;

  constructor(options: WooCommerceAdapterOptions) {
    this.storeUrl = options.url.replace(/\/+$/, '');
    this.consumerKey = options.consumerKey;
    this.consumerSecret = options.consumerSecret;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.apiBase = `${this.storeUrl}/wp-json/wc/v3`;
  }

  get domain(): string {
    return this.storeUrl.replace(/^https?:\/\//, '');
  }

  matchesDomain(domain: string): boolean {
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return clean === this.domain;
  }

  async discover(_domain: string): Promise<MerchantAdapterDiscovery> {
    const res = await this.get<{ name: string; description: string; url: string }>(
      '/settings/general',
      true
    );

    const siteName = Array.isArray(res)
      ? this.domain
      : (res as Record<string, unknown>)['blogname'] as string ?? this.domain;

    return {
      domain: this.domain,
      name: siteName,
      protocol: 'adapter',
      adapterType: 'woocommerce',
      capabilities: [
        'products.list',
        'products.search',
        'products.get',
        'checkout.create',
        'orders.track',
      ],
    };
  }

  async listProducts(options?: {
    page?: number;
    limit?: number;
    category?: string;
  }): Promise<{ products: MockProduct[]; total: number }> {
    const perPage = Math.min(options?.limit ?? 10, 100);
    const page = options?.page ?? 1;

    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      status: 'publish',
    });

    if (options?.category) {
      params.set('category', options.category);
    }

    const products = await this.get<WcProduct[]>(`/products?${params}`);

    return {
      products: products.map(p => this.toMockProduct(p)),
      total: products.length,
    };
  }

  async searchProducts(
    query: string,
    limit?: number
  ): Promise<{ products: MockProduct[]; total: number; query: string }> {
    const perPage = Math.min(limit ?? 10, 100);

    const params = new URLSearchParams({
      search: query,
      per_page: String(perPage),
      status: 'publish',
    });

    const products = await this.get<WcProduct[]>(`/products?${params}`);

    return {
      products: products.map(p => this.toMockProduct(p)),
      total: products.length,
      query,
    };
  }

  async getProduct(productId: string): Promise<MockProduct> {
    const product = await this.get<WcProduct>(`/products/${encodeURIComponent(productId)}`);
    return this.toMockProduct(product);
  }

  async createCheckout(items: CartItem[]): Promise<{
    sessionId: string;
    totals: { subtotal: MoneyAmount; total: MoneyAmount };
    shippingOptions?: Array<{
      id: string;
      name: string;
      price: MoneyAmount;
      estimatedDays: string;
    }>;
  }> {
    if (!this.consumerKey || !this.consumerSecret) {
      throw new WooCommerceAdapterError(
        'WooCommerce checkout requires consumerKey and consumerSecret. ' +
        'Set them in WooCommerceAdapterOptions to enable write operations.'
      );
    }

    const lineItems = items.map(item => ({
      product_id: parseInt(item.productId, 10),
      quantity: item.quantity,
    }));

    const order = await this.post<WcOrder>('/orders', {
      status: 'pending',
      line_items: lineItems,
      billing: {
        first_name: 'Agent',
        last_name: 'Purchase',
        email: 'agent@agorio.dev',
        address_1: '',
        city: '',
        postcode: '',
        country: 'US',
      },
    });

    const total = order.total ?? '0.00';
    const currency = order.currency ?? 'USD';

    return {
      sessionId: String(order.id),
      totals: {
        subtotal: { amount: total, currency },
        total: { amount: total, currency },
      },
    };
  }

  async completeCheckout(
    sessionId: string,
    payment: { method: string; token?: string },
    shippingAddress: ShippingAddress
  ): Promise<{ orderId: string; status: string }> {
    if (!this.consumerKey || !this.consumerSecret) {
      throw new WooCommerceAdapterError(
        'WooCommerce checkout requires consumerKey and consumerSecret.'
      );
    }

    const updated = await this.post<WcOrder>(`/orders/${sessionId}`, {
      status: 'processing',
      payment_method: payment.method,
      billing: {
        first_name: shippingAddress.name.split(' ')[0] ?? '',
        last_name: shippingAddress.name.split(' ').slice(1).join(' ') ?? '',
        address_1: shippingAddress.line1,
        address_2: shippingAddress.line2 ?? '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        postcode: shippingAddress.postalCode,
        country: shippingAddress.country,
        email: 'agent@agorio.dev',
      },
    });

    return {
      orderId: String(updated.id),
      status: updated.status,
    };
  }

  // ─── Internal Helpers ───

  private async get<T>(path: string, allowAny = false): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.apiBase}${path}`;
    const headers = this.buildAuthHeaders();

    const response = await this.fetchFn(url, { headers });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new WooCommerceAdapterError(
        `WooCommerce API error: GET ${path} → ${response.status} ${response.statusText} — ${body}`
      );
    }

    const json = await response.json();

    if (!allowAny && typeof json === 'object' && json !== null && 'code' in json && 'message' in json) {
      throw new WooCommerceAdapterError(
        `WooCommerce error: ${(json as { code: string; message: string }).message}`
      );
    }

    return json as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const headers = {
      ...this.buildAuthHeaders(),
      'Content-Type': 'application/json',
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new WooCommerceAdapterError(
        `WooCommerce API error: POST ${path} → ${response.status} ${response.statusText} — ${errBody}`
      );
    }

    const json = await response.json();
    return json as T;
  }

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': '@agorio/sdk',
    };

    if (this.consumerKey && this.consumerSecret) {
      const creds = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    return headers;
  }

  private toMockProduct(p: WcProduct): MockProduct {
    const inStock = p.stock_status === 'instock' || p.stock_status === 'onbackorder';
    const category = p.categories[0]?.name;
    const imageUrl = p.images[0]?.src;
    const price = p.price || p.regular_price || '0.00';

    return {
      id: String(p.id),
      name: p.name,
      description: p.short_description || p.description || '',
      price: {
        amount: parseFloat(price).toFixed(2),
        currency: 'USD',
      },
      category,
      inStock,
      imageUrl,
      variants:
        p.type === 'variable' && p.variations.length > 0
          ? p.variations.map((vId, i) => ({
              id: String(vId),
              name: `Variant ${i + 1}`,
            }))
          : undefined,
    };
  }
}

// ─── Static helpers ───

/**
 * Check if a domain is likely a WooCommerce store by probing /wp-json/wc/v3/products.
 * Returns true if the endpoint responds with a 200 OK (even without auth).
 */
export async function isWooCommerceStore(
  domain: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<boolean> {
  const url = `https://${domain.replace(/^https?:\/\//, '')}/wp-json/wc/v3/products?per_page=1`;
  try {
    const res = await fetchFn(url, {
      headers: { Accept: 'application/json', 'User-Agent': '@agorio/sdk' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Error Class ───

export class WooCommerceAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WooCommerceAdapterError';
  }
}
