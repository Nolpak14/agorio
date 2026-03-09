/**
 * Tests for multi-merchant support and new v0.4 tools
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCall } from '../src/types/index.js';

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-mock';
  private callIndex = 0;
  private readonly script: Array<{ content?: string; toolCalls?: ToolCall[] }>;

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex++];
    if (!step) {
      return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    }
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
    };
  }
}

describe('Multi-Merchant Support', () => {
  let merchant1: MockMerchant;
  let merchant2: MockMerchant;

  beforeAll(async () => {
    merchant1 = new MockMerchant({ name: 'TechDirect' });
    merchant2 = new MockMerchant({ name: 'GadgetWorld' });
    await merchant1.start();
    await merchant2.start();
  });

  afterAll(async () => {
    await merchant1.stop();
    await merchant2.stop();
  });

  it('should discover multiple merchants', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'discover_merchant',
          arguments: { domain: merchant2.domain },
        }],
      },
      { content: 'Both merchants discovered.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Discover both merchants');

    expect(result.success).toBe(true);
    expect(agent.getMerchants()).toHaveLength(2);
    expect(agent.getMerchants()).toContain(merchant1.domain);
    expect(agent.getMerchants()).toContain(merchant2.domain);
  });

  it('should isolate carts per merchant', async () => {
    const llm = new ScriptedLlm([
      // Discover merchant 1
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      // Add item to merchant 1 cart
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_webcam', quantity: 1 },
        }],
      },
      // Discover merchant 2 (switches active merchant)
      {
        toolCalls: [{
          id: 'call_3',
          name: 'discover_merchant',
          arguments: { domain: merchant2.domain },
        }],
      },
      // Add different item to merchant 2 cart
      {
        toolCalls: [{
          id: 'call_4',
          name: 'add_to_cart',
          arguments: { productId: 'prod_usb_hub', quantity: 2 },
        }],
      },
      // View cart (should be merchant 2's cart)
      {
        toolCalls: [{
          id: 'call_5',
          name: 'view_cart',
          arguments: {},
        }],
      },
      { content: 'Carts are separate.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    await agent.run('Add items to different merchants');

    // Active merchant is merchant 2 (last discovered)
    const cart = agent.getCart();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].productId).toBe('prod_usb_hub');
    expect(cart.items[0].quantity).toBe(2);
  });

  it('should switch between merchants', async () => {
    const llm = new ScriptedLlm([
      // Discover both merchants
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_webcam', quantity: 1 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'discover_merchant',
          arguments: { domain: merchant2.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'add_to_cart',
          arguments: { productId: 'prod_usb_hub', quantity: 1 },
        }],
      },
      // Switch back to merchant 1
      {
        toolCalls: [{
          id: 'call_5',
          name: 'switch_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      // View cart should show merchant 1's cart
      {
        toolCalls: [{
          id: 'call_6',
          name: 'view_cart',
          arguments: {},
        }],
      },
      { content: 'Switched back.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    await agent.run('Switch merchants and check carts');

    // After switch, active merchant is merchant 1
    expect(agent.getActiveMerchant()).toBe(merchant1.domain);
    const cart = agent.getCart();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].productId).toBe('prod_webcam');
  });

  it('should fail to switch to undiscovered merchant', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'switch_merchant',
          arguments: { domain: 'unknown.example.com' },
        }],
      },
      { content: 'Failed as expected.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Switch to unknown merchant');

    expect(result.success).toBe(true);
    // The switch_merchant tool should have returned an error
    const switchResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'switch_merchant'
    );
    expect(switchResult?.toolOutput).toEqual(expect.objectContaining({
      error: expect.stringContaining('has not been discovered'),
    }));
  });

  it('should compare prices across merchants', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'discover_merchant',
          arguments: { domain: merchant2.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'compare_prices',
          arguments: { query: 'headphones' },
        }],
      },
      { content: 'Price comparison complete.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Compare headphone prices');

    expect(result.success).toBe(true);
    const compareResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'compare_prices'
    );
    const output = compareResult?.toolOutput as {
      query: string;
      merchants: Array<{ merchant: string; products: unknown[] }>;
    };
    expect(output.query).toBe('headphones');
    expect(output.merchants).toHaveLength(2);
  });

  it('should fail price comparison with single merchant', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant1.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'compare_prices',
          arguments: { query: 'headphones' },
        }],
      },
      { content: 'Need more merchants.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Compare with one merchant');

    const compareResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'compare_prices'
    );
    expect(compareResult?.toolOutput).toEqual(expect.objectContaining({
      error: expect.stringContaining('at least 2 discovered merchants'),
    }));
  });
});

describe('New Shopping Tools', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Tools Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('should get product reviews', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'get_product_reviews',
          arguments: { productId: 'prod_wireless_headphones' },
        }],
      },
      { content: 'Reviews found.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Get reviews');

    const reviewResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'get_product_reviews'
    );
    const output = reviewResult?.toolOutput as {
      productId: string;
      averageRating: number;
      totalReviews: number;
      reviews: Array<{ author: string; rating: number }>;
    };
    expect(output.productId).toBe('prod_wireless_headphones');
    expect(output.averageRating).toBeGreaterThan(0);
    expect(output.totalReviews).toBeGreaterThan(0);
    expect(output.reviews.length).toBeGreaterThan(0);
    expect(output.reviews[0]).toHaveProperty('author');
    expect(output.reviews[0]).toHaveProperty('rating');
  });

  it('should apply discount code', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_wireless_headphones', quantity: 1 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'apply_discount_code',
          arguments: { code: 'SAVE10' },
        }],
      },
      { content: 'Discount applied.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Apply discount code');

    const discountResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'apply_discount_code'
    );
    const output = discountResult?.toolOutput as {
      success: boolean;
      code: string;
      discount: { type: string; value: number };
    };
    expect(output.success).toBe(true);
    expect(output.code).toBe('SAVE10');
    expect(output.discount.value).toBe(10);
  });

  it('should reject invalid discount code', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_webcam', quantity: 1 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'apply_discount_code',
          arguments: { code: 'INVALID' },
        }],
      },
      { content: 'Invalid code.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Apply invalid discount');

    const discountResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'apply_discount_code'
    );
    expect(discountResult?.toolOutput).toEqual(expect.objectContaining({
      error: expect.stringContaining('discount code'),
    }));
  });

  it('should enrich cart items with real product data (price fix)', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_laptop_stand', quantity: 1 },
        }],
      },
      { content: 'Added to cart.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    await agent.run('Add laptop stand to cart');

    const cart = agent.getCart();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].name).toBe('ErgoRise Laptop Stand');
    expect(cart.items[0].price.amount).toBe('59.99');
    expect(cart.items[0].price.currency).toBe('USD');
  });
});

describe('Adapter Integration', () => {
  it('should route through adapter when matching domain', async () => {
    // Create a mock adapter
    const mockAdapter = {
      adapterType: 'mock-platform',
      matchesDomain: (d: string) => d.includes('mock-platform'),
      discover: async (_domain: string) => ({
        domain: 'mock-platform.com',
        name: 'Mock Platform Store',
        protocol: 'adapter' as const,
        adapterType: 'mock-platform',
        capabilities: ['products.list', 'products.search'],
      }),
      listProducts: async () => ({
        products: [
          {
            id: 'mp_1',
            name: 'Platform Product',
            description: 'From the adapter',
            price: { amount: '19.99', currency: 'USD' },
            inStock: true,
          },
        ],
        total: 1,
      }),
      searchProducts: async (query: string) => ({
        products: [{
          id: 'mp_1',
          name: 'Platform Product',
          description: 'From the adapter',
          price: { amount: '19.99', currency: 'USD' },
          inStock: true,
        }],
        total: 1,
        query,
      }),
      getProduct: async (_id: string) => ({
        id: 'mp_1',
        name: 'Platform Product',
        description: 'From the adapter',
        price: { amount: '19.99', currency: 'USD' },
        inStock: true,
      }),
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: 'mock-platform.com' },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'browse_products',
          arguments: { limit: 5 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'search_products',
          arguments: { query: 'product' },
        }],
      },
      { content: 'Found products via adapter.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      adapters: [mockAdapter],
    });

    const result = await agent.run('Browse mock-platform.com');

    expect(result.success).toBe(true);
    expect(result.merchant?.domain).toBe('mock-platform.com');

    // Check browse results
    const browseResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'browse_products'
    );
    const browseOutput = browseResult?.toolOutput as { products: Array<{ name: string }> };
    expect(browseOutput.products[0].name).toBe('Platform Product');

    // Check search results
    const searchResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'search_products'
    );
    const searchOutput = searchResult?.toolOutput as { products: Array<{ name: string }> };
    expect(searchOutput.products[0].name).toBe('Platform Product');
  });

  it('should fall through to UCP when adapter does not match', async () => {
    const mockAdapter = {
      adapterType: 'specific-platform',
      matchesDomain: (d: string) => d.includes('specific-platform'),
      discover: async () => ({ domain: 'x', name: 'X', protocol: 'adapter' as const, adapterType: 'x', capabilities: [] }),
      listProducts: async () => ({ products: [], total: 0 }),
      searchProducts: async (q: string) => ({ products: [], total: 0, query: q }),
      getProduct: async () => ({ id: '1', name: 'X', description: '', price: { amount: '0', currency: 'USD' } }),
    };

    const merchant = new MockMerchant({ name: 'Fallback Store' });
    await merchant.start();

    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      { content: 'Discovered via UCP (adapter did not match).' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      adapters: [mockAdapter],
    });

    const result = await agent.run(`Discover ${merchant.domain}`);

    expect(result.success).toBe(true);
    // Should have discovered via UCP, not adapter
    const discoverResult = result.steps.find(s =>
      s.type === 'tool_result' && s.toolName === 'discover_merchant'
    );
    const output = discoverResult?.toolOutput as { protocol: string };
    expect(output.protocol).toBe('ucp');

    await merchant.stop();
  });
});
