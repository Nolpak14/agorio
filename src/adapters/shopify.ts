/**
 * Shopify Storefront API Adapter
 *
 * Connects agorio agents to real Shopify stores via the Storefront API (GraphQL).
 * Translates Shopify products into UCP-compatible format so agents can browse
 * and search real product catalogs.
 *
 * Usage:
 *   const adapter = new ShopifyAdapter({
 *     store: 'my-store',
 *     storefrontAccessToken: 'your-storefront-access-token',
 *   });
 *
 *   const agent = new ShoppingAgent({
 *     llm: new GeminiAdapter({ apiKey: '...' }),
 *     adapters: [adapter],
 *   });
 *
 *   await agent.run('Search for running shoes on my-store.myshopify.com');
 */

import type {
  MerchantAdapter,
  MerchantAdapterDiscovery,
  MockProduct,
  MoneyAmount,
  CartItem,
  ShippingAddress,
} from '../types/index.js';

export interface ShopifyAdapterOptions {
  /** Shopify store handle (e.g., 'my-store' for my-store.myshopify.com) */
  store: string;
  /** Storefront API access token */
  storefrontAccessToken: string;
  /** API version (default: '2024-10') */
  apiVersion?: string;
  /** Custom domain if the store uses one (e.g., 'shop.example.com') */
  customDomain?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
}

// ─── GraphQL Response Types ───

interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  productType: string;
  availableForSale: boolean;
  featuredImage?: { url: string } | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        availableForSale: boolean;
        price: { amount: string; currencyCode: string };
      };
    }>;
  };
}

interface ShopifyProductsResponse {
  data: {
    products: {
      edges: Array<{ node: ShopifyProduct; cursor: string }>;
      pageInfo: { hasNextPage: boolean };
    };
  };
  errors?: Array<{ message: string }>;
}

interface ShopifyProductResponse {
  data: {
    product: ShopifyProduct | null;
  };
  errors?: Array<{ message: string }>;
}

interface ShopifyCartCreateResponse {
  data: {
    cartCreate: {
      cart: {
        id: string;
        checkoutUrl: string;
        cost: {
          subtotalAmount: { amount: string; currencyCode: string };
          totalAmount: { amount: string; currencyCode: string };
        };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  };
  errors?: Array<{ message: string }>;
}

// ─── Adapter Implementation ───

export class ShopifyAdapter implements MerchantAdapter {
  readonly adapterType = 'shopify';

  private readonly store: string;
  private readonly token: string;
  private readonly apiVersion: string;
  private readonly customDomain: string | null;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly endpoint: string;

  /** Maps agorio product IDs to Shopify global IDs for variant lookup */
  private productVariantMap: Map<string, string> = new Map();

  constructor(options: ShopifyAdapterOptions) {
    this.store = options.store;
    this.token = options.storefrontAccessToken;
    this.apiVersion = options.apiVersion ?? '2024-10';
    this.customDomain = options.customDomain ?? null;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.endpoint = `https://${this.store}.myshopify.com/api/${this.apiVersion}/graphql.json`;
  }

  /** The domain this adapter handles */
  get domain(): string {
    return this.customDomain ?? `${this.store}.myshopify.com`;
  }

  /** Check if a domain matches this adapter */
  matchesDomain(domain: string): boolean {
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return (
      clean === `${this.store}.myshopify.com` ||
      clean === this.customDomain ||
      clean === this.store
    );
  }

  async discover(_domain: string): Promise<MerchantAdapterDiscovery> {
    // Verify the store is reachable by fetching a single product
    const query = `{
      shop {
        name
        description
      }
      products(first: 1) {
        edges { node { id } }
      }
    }`;

    const result = await this.graphql<{
      data: {
        shop: { name: string; description: string };
        products: { edges: Array<{ node: { id: string } }> };
      };
    }>(query);

    return {
      domain: this.domain,
      name: result.data.shop.name,
      protocol: 'adapter',
      adapterType: 'shopify',
      capabilities: [
        'products.list',
        'products.search',
        'products.get',
        'cart.create',
        'checkout.redirect',
      ],
    };
  }

  async listProducts(options?: {
    page?: number;
    limit?: number;
    category?: string;
  }): Promise<{ products: MockProduct[]; total: number }> {
    const limit = Math.min(options?.limit ?? 10, 50);
    const categoryFilter = options?.category
      ? `, query: "product_type:${options.category}"`
      : '';

    const query = `{
      products(first: ${limit}${categoryFilter}) {
        edges {
          node {
            id
            title
            description
            productType
            availableForSale
            featuredImage { url }
            priceRange {
              minVariantPrice { amount currencyCode }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price { amount currencyCode }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`;

    const result = await this.graphql<ShopifyProductsResponse>(query);
    const products = result.data.products.edges.map(({ node }) =>
      this.toMockProduct(node)
    );

    return { products, total: products.length };
  }

  async searchProducts(
    searchQuery: string,
    limit?: number
  ): Promise<{ products: MockProduct[]; total: number; query: string }> {
    const count = Math.min(limit ?? 10, 50);

    const query = `{
      products(first: ${count}, query: "${this.escapeGraphQL(searchQuery)}") {
        edges {
          node {
            id
            title
            description
            productType
            availableForSale
            featuredImage { url }
            priceRange {
              minVariantPrice { amount currencyCode }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }`;

    const result = await this.graphql<ShopifyProductsResponse>(query);
    const products = result.data.products.edges.map(({ node }) =>
      this.toMockProduct(node)
    );

    return { products, total: products.length, query: searchQuery };
  }

  async getProduct(productId: string): Promise<MockProduct> {
    // Shopify global IDs are base64 encoded like "gid://shopify/Product/12345"
    // Accept both raw numeric IDs and global IDs
    const gid = productId.startsWith('gid://')
      ? productId
      : `gid://shopify/Product/${productId}`;

    const query = `{
      product(id: "${this.escapeGraphQL(gid)}") {
        id
        title
        description
        productType
        availableForSale
        featuredImage { url }
        priceRange {
          minVariantPrice { amount currencyCode }
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              availableForSale
              price { amount currencyCode }
            }
          }
        }
      }
    }`;

    const result = await this.graphql<ShopifyProductResponse>(query);

    if (!result.data.product) {
      throw new ShopifyAdapterError(`Product not found: ${productId}`);
    }

    return this.toMockProduct(result.data.product);
  }

  async createCheckout(
    items: CartItem[]
  ): Promise<{
    sessionId: string;
    totals: { subtotal: MoneyAmount; total: MoneyAmount };
    shippingOptions?: Array<{
      id: string;
      name: string;
      price: MoneyAmount;
      estimatedDays: string;
    }>;
    checkoutUrl?: string;
  }> {
    // Build cart lines from items
    const lines = items.map((item) => {
      // Try to resolve variant ID from our map
      const variantId =
        this.productVariantMap.get(item.productId) ??
        `gid://shopify/ProductVariant/${item.productId}`;

      return `{ merchandiseId: "${this.escapeGraphQL(variantId)}", quantity: ${item.quantity} }`;
    });

    const mutation = `mutation {
      cartCreate(input: {
        lines: [${lines.join(', ')}]
      }) {
        cart {
          id
          checkoutUrl
          cost {
            subtotalAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }`;

    const result = await this.graphql<ShopifyCartCreateResponse>(mutation);

    if (result.data.cartCreate.userErrors.length > 0) {
      const errors = result.data.cartCreate.userErrors
        .map((e) => e.message)
        .join(', ');
      throw new ShopifyAdapterError(`Cart creation failed: ${errors}`);
    }

    const cart = result.data.cartCreate.cart;
    if (!cart) {
      throw new ShopifyAdapterError('Cart creation returned no cart');
    }

    return {
      sessionId: cart.id,
      totals: {
        subtotal: {
          amount: cart.cost.subtotalAmount.amount,
          currency: cart.cost.subtotalAmount.currencyCode,
        },
        total: {
          amount: cart.cost.totalAmount.amount,
          currency: cart.cost.totalAmount.currencyCode,
        },
      },
      checkoutUrl: cart.checkoutUrl,
    };
  }

  async completeCheckout(
    _sessionId: string,
    _payment: { method: string; token?: string },
    _shippingAddress: ShippingAddress
  ): Promise<{ orderId: string; status: string }> {
    // Shopify Storefront API doesn't support server-side checkout completion.
    // Real purchases redirect to the Shopify checkout URL.
    throw new ShopifyAdapterError(
      'Shopify checkout must be completed via the checkout URL. ' +
        'Use createCheckout() to get the checkoutUrl, then redirect the user.'
    );
  }

  // ─── Internal Helpers ───

  private async graphql<T>(query: string): Promise<T> {
    const response = await this.fetchFn(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.token,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ShopifyAdapterError(
        `Shopify API error: ${response.status} ${response.statusText} - ${body}`
      );
    }

    const json = (await response.json()) as T & {
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new ShopifyAdapterError(
        `Shopify GraphQL error: ${json.errors.map((e) => e.message).join(', ')}`
      );
    }

    return json;
  }

  /**
   * Convert a Shopify product to MockProduct format.
   */
  private toMockProduct(shopifyProduct: ShopifyProduct): MockProduct {
    const numericId = this.extractNumericId(shopifyProduct.id);

    // Cache the first variant ID for cart operations
    const firstVariant = shopifyProduct.variants.edges[0]?.node;
    if (firstVariant) {
      this.productVariantMap.set(numericId, firstVariant.id);
    }

    const price = shopifyProduct.priceRange.minVariantPrice;

    return {
      id: numericId,
      name: shopifyProduct.title,
      description: shopifyProduct.description,
      price: {
        amount: parseFloat(price.amount).toFixed(2),
        currency: price.currencyCode,
      },
      category: shopifyProduct.productType || undefined,
      inStock: shopifyProduct.availableForSale,
      imageUrl: shopifyProduct.featuredImage?.url,
      variants: shopifyProduct.variants.edges.map(({ node: v }) => ({
        id: this.extractNumericId(v.id),
        name: v.title,
        price: v.price
          ? {
              amount: parseFloat(v.price.amount).toFixed(2),
              currency: v.price.currencyCode,
            }
          : undefined,
      })),
    };
  }

  /**
   * Extract numeric ID from Shopify global ID.
   * "gid://shopify/Product/12345" → "12345"
   */
  private extractNumericId(gid: string): string {
    const parts = gid.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Escape a string for use in GraphQL query.
   */
  private escapeGraphQL(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

// ─── Error Class ───

export class ShopifyAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyAdapterError';
  }
}
