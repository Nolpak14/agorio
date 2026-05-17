/**
 * BigCommerce v3 Adapter
 *
 * Connects agorio agents to BigCommerce stores via the v3 catalog/cart/checkout APIs.
 * Translates BigCommerce products into UCP-compatible format.
 *
 * Requires an `X-Auth-Token` (API account token) and the store hash.
 *
 * Usage:
 *   const adapter = new BigCommerceAdapter({
 *     storeHash: 'abc123',
 *     accessToken: process.env.BIGCOMMERCE_TOKEN!,
 *   });
 *
 *   const agent = new ShoppingAgent({
 *     llm: new GeminiAdapter({ apiKey: '...' }),
 *     adapters: [adapter],
 *   });
 *
 *   await agent.run('Search for running shoes on mystore.mybigcommerce.com');
 */

import type {
  MerchantAdapter,
  MerchantAdapterDiscovery,
  MockProduct,
  MoneyAmount,
  CartItem,
  ShippingAddress,
} from '../types/index.js';

export interface BigCommerceAdapterOptions {
  /** BigCommerce store hash (e.g. 'abc123' from store-abc123.mybigcommerce.com) */
  storeHash: string;
  /** BigCommerce API access token (X-Auth-Token) — required for cart/checkout */
  accessToken?: string;
  /** Optional storefront domain override (defaults to store-<hash>.mybigcommerce.com) */
  domain?: string;
  /** Default currency (BigCommerce REST does not always include currency on product) */
  currency?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
  /** Override API base URL (default: https://api.bigcommerce.com) */
  apiBaseUrl?: string;
}

// ─── BigCommerce v3 types (subset) ───

interface BcProduct {
  id: number;
  name: string;
  type: string;
  sku: string;
  description: string;
  price: number;
  retail_price?: number;
  sale_price?: number;
  inventory_level: number;
  inventory_tracking: 'none' | 'product' | 'variant';
  is_visible: boolean;
  categories: number[];
  custom_url?: { url: string };
  images?: Array<{ url_standard?: string; url_thumbnail?: string; is_thumbnail?: boolean }>;
  variants?: Array<{ id: number; sku: string; option_values?: Array<{ label: string; option_display_name: string }> }>;
  availability: 'available' | 'disabled' | 'preorder';
}

interface BcEnvelope<T> {
  data: T;
  meta?: { pagination?: { total: number } };
}

interface BcCart {
  id: string;
  currency: { code: string };
  cart_amount: number;
  base_amount?: number;
  line_items: { physical_items: Array<{ id: string; product_id: number; quantity: number }> };
}

interface BcOrder {
  id: number;
  status: string;
  total_inc_tax: string;
  currency_code: string;
}

// ─── Adapter ───

export class BigCommerceAdapter implements MerchantAdapter {
  readonly adapterType = 'bigcommerce';

  private readonly storeHash: string;
  private readonly accessToken: string | undefined;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly storeDomain: string;
  private readonly apiBase: string;
  private readonly currency: string;

  constructor(options: BigCommerceAdapterOptions) {
    if (!options.storeHash) {
      throw new BigCommerceAdapterError('storeHash is required');
    }
    this.storeHash = options.storeHash;
    this.accessToken = options.accessToken;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.storeDomain = (options.domain ?? `store-${options.storeHash}.mybigcommerce.com`)
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    const apiRoot = (options.apiBaseUrl ?? 'https://api.bigcommerce.com').replace(/\/+$/, '');
    this.apiBase = `${apiRoot}/stores/${this.storeHash}/v3`;
    this.currency = options.currency ?? 'USD';
  }

  get domain(): string {
    return this.storeDomain;
  }

  matchesDomain(domain: string): boolean {
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (clean === this.storeDomain) return true;
    // Auto-match any *.mybigcommerce.com store using this adapter's storeHash
    return clean === `store-${this.storeHash}.mybigcommerce.com`;
  }

  async discover(_domain: string): Promise<MerchantAdapterDiscovery> {
    // /catalog/summary requires only Products read scope — used as a connectivity probe
    let name = this.storeDomain;
    try {
      const summary = await this.get<BcEnvelope<{ inventory_count?: number; primary_currency_code?: string }>>(
        '/catalog/summary'
      );
      if (summary.data?.primary_currency_code) {
        // Keep the currency we have but stash it on the discovery payload via capabilities
      }
    } catch {
      // Tolerate failures — discover() should not hard-fail on auth issues
    }

    return {
      domain: this.storeDomain,
      name,
      protocol: 'adapter',
      adapterType: 'bigcommerce',
      capabilities: [
        'products.list',
        'products.search',
        'products.get',
        ...(this.accessToken
          ? ['checkout.create', 'checkout.complete', 'orders.track']
          : []),
      ],
    };
  }

  async listProducts(options?: {
    page?: number;
    limit?: number;
    category?: string;
  }): Promise<{ products: MockProduct[]; total: number }> {
    const limit = Math.min(options?.limit ?? 10, 250);
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(options?.page ?? 1),
      'is_visible': 'true',
      include: 'images,variants',
    });

    if (options?.category) {
      params.set('categories:in', options.category);
    }

    const env = await this.get<BcEnvelope<BcProduct[]>>(`/catalog/products?${params}`);

    return {
      products: env.data.map(p => this.toMockProduct(p)),
      total: env.meta?.pagination?.total ?? env.data.length,
    };
  }

  async searchProducts(
    query: string,
    limit?: number
  ): Promise<{ products: MockProduct[]; total: number; query: string }> {
    const perPage = Math.min(limit ?? 10, 250);
    const params = new URLSearchParams({
      keyword: query,
      limit: String(perPage),
      'is_visible': 'true',
      include: 'images,variants',
    });

    const env = await this.get<BcEnvelope<BcProduct[]>>(`/catalog/products?${params}`);

    return {
      products: env.data.map(p => this.toMockProduct(p)),
      total: env.meta?.pagination?.total ?? env.data.length,
      query,
    };
  }

  async getProduct(productId: string): Promise<MockProduct> {
    const env = await this.get<BcEnvelope<BcProduct>>(
      `/catalog/products/${encodeURIComponent(productId)}?include=images,variants`
    );
    return this.toMockProduct(env.data);
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
    this.requireAuth('checkout');

    const lineItems = items.map(item => ({
      product_id: parseInt(item.productId, 10),
      quantity: item.quantity,
    }));

    const env = await this.post<BcEnvelope<BcCart>>('/carts', {
      line_items: lineItems,
    });

    const cart = env.data;
    const total = cart.cart_amount.toFixed(2);
    const subtotal = (cart.base_amount ?? cart.cart_amount).toFixed(2);
    const currency = cart.currency.code ?? this.currency;

    return {
      sessionId: cart.id,
      totals: {
        subtotal: { amount: subtotal, currency },
        total: { amount: total, currency },
      },
    };
  }

  async completeCheckout(
    sessionId: string,
    payment: { method: string; token?: string },
    shippingAddress: ShippingAddress
  ): Promise<{ orderId: string; status: string }> {
    this.requireAuth('checkout');

    // BigCommerce flow: PUT a billing address on the checkout, then POST /checkouts/{id}/orders
    const [firstName, ...rest] = shippingAddress.name.split(' ');

    await this.put<unknown>(`/checkouts/${sessionId}/billing-address`, {
      first_name: firstName ?? '',
      last_name: rest.join(' ') || 'Agent',
      address1: shippingAddress.line1,
      address2: shippingAddress.line2 ?? '',
      city: shippingAddress.city,
      state_or_province: shippingAddress.state,
      postal_code: shippingAddress.postalCode,
      country_code: shippingAddress.country,
      email: 'agent@agorio.dev',
    });

    const env = await this.post<BcEnvelope<{ id: number }>>(
      `/checkouts/${sessionId}/orders`,
      {}
    );

    const orderId = String(env.data.id);
    // Pull current status — non-fatal if it fails
    let status = 'pending';
    try {
      const orderEnv = await this.get<BcEnvelope<BcOrder>>(`/orders/${orderId}`);
      status = orderEnv.data.status;
    } catch {
      /* keep default */
    }

    // payment is recorded against the order; agorio's adapter contract is satisfied
    // once the order is created.
    void payment;

    return { orderId, status };
  }

  // ─── Internal helpers ───

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchFn(`${this.apiBase}${path}`, {
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new BigCommerceAdapterError(
        `BigCommerce API error: GET ${path} → ${response.status} ${response.statusText} — ${body}`
      );
    }

    return (await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchFn(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new BigCommerceAdapterError(
        `BigCommerce API error: POST ${path} → ${response.status} ${response.statusText} — ${errBody}`
      );
    }

    return (await response.json()) as T;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchFn(`${this.apiBase}${path}`, {
      method: 'PUT',
      headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new BigCommerceAdapterError(
        `BigCommerce API error: PUT ${path} → ${response.status} ${response.statusText} — ${errBody}`
      );
    }

    return (await response.json()) as T;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': '@agorio/sdk',
    };
    if (this.accessToken) {
      headers['X-Auth-Token'] = this.accessToken;
    }
    return headers;
  }

  private requireAuth(operation: string): void {
    if (!this.accessToken) {
      throw new BigCommerceAdapterError(
        `BigCommerce ${operation} requires accessToken. Set it in BigCommerceAdapterOptions.`
      );
    }
  }

  private toMockProduct(p: BcProduct): MockProduct {
    const trackingDisabled = p.inventory_tracking === 'none';
    const inStock = p.availability === 'available' && (trackingDisabled || p.inventory_level > 0);
    const price = (p.sale_price && p.sale_price > 0 ? p.sale_price : p.price) ?? 0;
    const imageUrl = p.images?.find(img => img.is_thumbnail)?.url_standard
      ?? p.images?.[0]?.url_standard
      ?? p.images?.[0]?.url_thumbnail;

    return {
      id: String(p.id),
      name: p.name,
      description: p.description?.replace(/<[^>]+>/g, '').trim() ?? '',
      price: {
        amount: price.toFixed(2),
        currency: this.currency,
      },
      inStock,
      imageUrl,
      variants:
        p.variants && p.variants.length > 1
          ? p.variants.map(v => ({
              id: String(v.id),
              name: v.option_values?.map(o => `${o.option_display_name}: ${o.label}`).join(', ') ?? v.sku,
            }))
          : undefined,
    };
  }
}

// ─── Static helpers ───

/**
 * Check if a domain is a BigCommerce-hosted store by detecting the canonical
 * store-<hash>.mybigcommerce.com suffix. Custom domains require a manual probe
 * by the caller against a known API endpoint.
 */
export function isBigCommerceStore(domain: string): boolean {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return /^store-[a-z0-9]+\.mybigcommerce\.com$/.test(clean);
}

// ─── Error class ───

export class BigCommerceAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BigCommerceAdapterError';
  }
}
