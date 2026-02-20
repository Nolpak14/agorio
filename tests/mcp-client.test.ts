/**
 * Tests for MCP transport - JSON-RPC client, UcpClient MCP detection, and agent integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpClient, McpError } from '../src/client/mcp-client.js';
import { UcpClient } from '../src/client/ucp-client.js';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMcpMerchant } from '../src/mock/mock-mcp-merchant.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCall } from '../src/types/index.js';

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-mock';
  private callIndex = 0;
  private readonly script: Array<{
    content?: string;
    toolCalls?: ToolCall[];
  }>;

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex];
    this.callIndex++;

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

describe('McpClient', () => {
  let merchant: MockMcpMerchant;

  beforeAll(async () => {
    merchant = new MockMcpMerchant({ name: 'MCP Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('should make a JSON-RPC call and return result', async () => {
    const client = new McpClient({ endpoint: `${merchant.baseUrl}/mcp` });
    const result = (await client.call('products/list')) as {
      products: Array<{ id: string }>;
      total: number;
    };

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('should pass params in JSON-RPC call', async () => {
    const client = new McpClient({ endpoint: `${merchant.baseUrl}/mcp` });
    const result = (await client.call('products/search', { q: 'keyboard' })) as {
      products: Array<{ id: string; name: string }>;
      total: number;
    };

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products[0].name).toContain('Keyboard');
  });

  it('should get a single product by ID', async () => {
    const client = new McpClient({ endpoint: `${merchant.baseUrl}/mcp` });
    const result = (await client.call('products/get', { id: 'prod_wireless_headphones' })) as {
      id: string;
      name: string;
      price: { amount: string };
    };

    expect(result.id).toBe('prod_wireless_headphones');
    expect(result.name).toContain('Headphones');
    expect(parseFloat(result.price.amount)).toBe(149.99);
  });

  it('should throw McpError on JSON-RPC error', async () => {
    const client = new McpClient({ endpoint: `${merchant.baseUrl}/mcp` });
    await expect(
      client.call('products/get', { id: 'nonexistent' })
    ).rejects.toThrow(McpError);
  });

  it('should throw McpError with correct code for method not found', async () => {
    const client = new McpClient({ endpoint: `${merchant.baseUrl}/mcp` });
    try {
      await client.call('nonexistent/method');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(-32601);
    }
  });

  it('should throw McpError on HTTP error', async () => {
    const client = new McpClient({ endpoint: 'http://localhost:1/mcp', timeoutMs: 2000 });
    await expect(client.call('products/list')).rejects.toThrow();
  });

  it('should complete a checkout via MCP', async () => {
    const client = new McpClient({ endpoint: `${merchant.baseUrl}/mcp` });

    // Create checkout
    const checkout = (await client.call('checkout/create', {
      items: [
        {
          productId: 'prod_laptop_stand',
          name: 'ErgoRise Laptop Stand',
          quantity: 1,
          price: { amount: '59.99', currency: 'USD' },
        },
      ],
    })) as { sessionId: string; subtotal: { amount: string } };

    expect(checkout.sessionId).toBeDefined();
    expect(parseFloat(checkout.subtotal.amount)).toBe(59.99);

    // Complete checkout
    const order = (await client.call('checkout/complete', {
      sessionId: checkout.sessionId,
      payment: { method: 'mock_payment', token: 'tok_mock_success' },
      shippingAddress: {
        name: 'Test User',
        line1: '123 Test St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
    })) as { orderId: string; status: string };

    expect(order.orderId).toBeDefined();
    expect(order.status).toBe('confirmed');
  });
});

describe('UcpClient MCP transport', () => {
  let mcpMerchant: MockMcpMerchant;

  beforeAll(async () => {
    mcpMerchant = new MockMcpMerchant({ name: 'MCP-Only Store' });
    await mcpMerchant.start();
  });

  afterAll(async () => {
    await mcpMerchant.stop();
  });

  it('should detect MCP transport from discovery', async () => {
    const client = new UcpClient();
    const result = await client.discover(mcpMerchant.domain);

    const shopping = result.services.find(s => s.name === 'dev.ucp.shopping');
    expect(shopping).toBeDefined();
    expect(shopping!.transports.mcp).toBeDefined();
    expect(shopping!.transports.mcp!.endpoint).toContain('/mcp');
  });

  it('should return MCP endpoint via getMcpEndpoint()', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const endpoint = client.getMcpEndpoint();
    expect(endpoint).toBeDefined();
    expect(endpoint).toContain('/mcp');
  });

  it('should have no REST endpoint for MCP-only merchant', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const restEndpoint = client.getRestEndpoint();
    expect(restEndpoint).toBeUndefined();
  });

  it('should callApi() via MCP for MCP-only merchant (auto transport)', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const result = (await client.callApi('/products')) as {
      products: Array<{ id: string }>;
      total: number;
    };

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('should search products via MCP callApi()', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const result = (await client.callApi('/products/search?q=keyboard')) as {
      products: Array<{ id: string; name: string }>;
      total: number;
    };

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products[0].name).toContain('Keyboard');
  });

  it('should get a single product via MCP callApi()', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const result = (await client.callApi('/products/prod_wireless_headphones')) as {
      id: string;
      name: string;
    };

    expect(result.id).toBe('prod_wireless_headphones');
  });

  it('should handle checkout via MCP callApi()', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const checkout = (await client.callApi('/checkout', {
      method: 'POST',
      body: {
        items: [{
          productId: 'prod_usb_hub',
          name: 'ConnectAll USB-C Hub',
          quantity: 1,
          price: { amount: '39.99', currency: 'USD' },
        }],
      },
    })) as { sessionId: string };

    expect(checkout.sessionId).toBeDefined();
  });

  it('should call MCP directly via callMcp()', async () => {
    const client = new UcpClient();
    await client.discover(mcpMerchant.domain);

    const result = (await client.callMcp('products/list')) as {
      products: Array<{ id: string }>;
    };

    expect(result.products.length).toBeGreaterThan(0);
  });

  it('should throw when forcing MCP on REST-only merchant', async () => {
    const restMerchant = new MockMerchant({ name: 'REST-Only Store' });
    await restMerchant.start();

    try {
      const client = new UcpClient({ preferredTransport: 'mcp' });
      await client.discover(restMerchant.domain);

      await expect(client.callApi('/products')).rejects.toThrow(
        'No MCP endpoint available'
      );
    } finally {
      await restMerchant.stop();
    }
  });
});

describe('MCP fallback to REST', () => {
  let restMerchant: MockMerchant;

  beforeAll(async () => {
    restMerchant = new MockMerchant({ name: 'REST Fallback Store' });
    await restMerchant.start();
  });

  afterAll(async () => {
    await restMerchant.stop();
  });

  it('should fall back to REST when auto transport and no MCP available', async () => {
    const client = new UcpClient({ preferredTransport: 'auto' });
    await client.discover(restMerchant.domain);

    const result = (await client.callApi('/products')) as {
      products: Array<{ id: string }>;
      total: number;
    };

    expect(result.products.length).toBeGreaterThan(0);
  });

  it('should use REST explicitly when transport is set to rest', async () => {
    const client = new UcpClient({ preferredTransport: 'rest' });
    await client.discover(restMerchant.domain);

    const result = (await client.callApi('/products')) as {
      products: Array<{ id: string }>;
    };

    expect(result.products.length).toBeGreaterThan(0);
  });
});

describe('ShoppingAgent with MCP merchant', () => {
  let mcpMerchant: MockMcpMerchant;

  beforeAll(async () => {
    mcpMerchant = new MockMcpMerchant({ name: 'MCP Agent Store' });
    await mcpMerchant.start();
  });

  afterAll(async () => {
    await mcpMerchant.stop();
  });

  it('should discover an MCP-only merchant', async () => {
    const llm = new ScriptedLlm([
      {
        content: 'Let me discover this merchant.',
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: mcpMerchant.domain },
        }],
      },
      {
        content: 'Found an MCP merchant with checkout capabilities.',
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(`Discover ${mcpMerchant.domain}`);

    expect(result.success).toBe(true);
    expect(result.merchant).toBeDefined();
  });

  it('should browse products on an MCP-only merchant', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: mcpMerchant.domain },
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
        content: 'Found products including headphones and keyboards.',
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(`Browse products on ${mcpMerchant.domain}`);

    expect(result.success).toBe(true);
    expect(result.steps.some(s =>
      s.type === 'tool_result' &&
      JSON.stringify(s.toolOutput).includes('prod_wireless_headphones')
    )).toBe(true);
  });

  it('should search products on an MCP-only merchant', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: mcpMerchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'search_products',
          arguments: { query: 'webcam' },
        }],
      },
      {
        content: 'Found ClearView 4K Webcam for $79.99.',
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(`Search for webcam on ${mcpMerchant.domain}`);

    expect(result.success).toBe(true);
    expect(result.steps.some(s =>
      s.type === 'tool_result' &&
      JSON.stringify(s.toolOutput).includes('prod_webcam')
    )).toBe(true);
  });

  it('should complete full shopping flow on MCP-only merchant', async () => {
    const llm = new ScriptedLlm([
      // 1. Discover
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: mcpMerchant.domain },
        }],
      },
      // 2. Browse
      {
        toolCalls: [{
          id: 'call_2',
          name: 'browse_products',
          arguments: { limit: 5 },
        }],
      },
      // 3. Add to cart
      {
        toolCalls: [{
          id: 'call_3',
          name: 'add_to_cart',
          arguments: { productId: 'prod_mechanical_keyboard', quantity: 1 },
        }],
      },
      // 4. Initiate checkout
      {
        toolCalls: [{
          id: 'call_5',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      // 5. Submit shipping
      {
        toolCalls: [{
          id: 'call_6',
          name: 'submit_shipping',
          arguments: {
            name: 'MCP Shopper',
            line1: '456 MCP Blvd',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
        }],
      },
      // 6. Submit payment
      {
        toolCalls: [{
          id: 'call_7',
          name: 'submit_payment',
          arguments: {
            paymentMethod: 'mock_payment',
            paymentToken: 'tok_mock_success',
          },
        }],
      },
      // 7. Final answer
      {
        content: 'Order placed via MCP transport!',
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(
      `Buy a mechanical keyboard from ${mcpMerchant.domain}. Ship to 456 MCP Blvd, New York, NY 10001.`
    );

    expect(result.success).toBe(true);
    expect(result.checkout).toBeDefined();
    expect(result.checkout!.status).toBe('completed');
    expect(result.checkout!.orderId).toBeDefined();
  });
});
