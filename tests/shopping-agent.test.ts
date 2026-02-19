/**
 * Tests for ShoppingAgent - Agent orchestrator with mock LLM
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCall } from '../src/types/index.js';

/**
 * Mock LLM that executes a scripted sequence of tool calls.
 * Each call to chat() returns the next action in the script.
 */
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

describe('ShoppingAgent', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Agent Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('should discover a merchant and list capabilities', async () => {
    const llm = new ScriptedLlm([
      {
        content: 'Let me discover this merchant.',
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        content: 'Now let me check what capabilities they have.',
        toolCalls: [{
          id: 'call_2',
          name: 'list_capabilities',
          arguments: {},
        }],
      },
      {
        content: `The merchant at ${merchant.domain} supports checkout, orders, fulfillment, and discounts.`,
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(`What capabilities does ${merchant.domain} have?`);

    expect(result.success).toBe(true);
    expect(result.answer).toContain('checkout');
    expect(result.merchant).toBeDefined();
    expect(result.merchant!.domain).toBe(merchant.domain);
    expect(result.iterations).toBe(3);
  });

  it('should browse and search products', async () => {
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
          name: 'search_products',
          arguments: { query: 'headphones' },
        }],
      },
      {
        content: 'I found ProSound Wireless Headphones for $149.99.',
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(
      `Search for headphones on ${merchant.domain}`
    );

    expect(result.success).toBe(true);
    expect(result.answer).toContain('149.99');
  });

  it('should complete a full shopping flow', async () => {
    const llm = new ScriptedLlm([
      // 1. Discover
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
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
          arguments: { productId: 'prod_laptop_stand', quantity: 1 },
        }],
      },
      // 4. View cart
      {
        toolCalls: [{
          id: 'call_4',
          name: 'view_cart',
          arguments: {},
        }],
      },
      // 5. Initiate checkout
      {
        toolCalls: [{
          id: 'call_5',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      // 6. Submit shipping
      {
        toolCalls: [{
          id: 'call_6',
          name: 'submit_shipping',
          arguments: {
            name: 'Test User',
            line1: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            country: 'US',
          },
        }],
      },
      // 7. Submit payment
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
      // 8. Final answer
      {
        content: 'Order placed successfully! Your order has been confirmed.',
      },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(
      `Buy a laptop stand from ${merchant.domain}. Ship to 123 Main St, San Francisco, CA 94105.`
    );

    expect(result.success).toBe(true);
    expect(result.checkout).toBeDefined();
    expect(result.checkout!.status).toBe('completed');
    expect(result.checkout!.orderId).toBeDefined();
    expect(result.iterations).toBe(8);
  });

  it('should track steps with onStep callback', async () => {
    const steps: Array<{ type: string; toolName?: string }> = [];

    const llm = new ScriptedLlm([
      {
        content: 'Discovering...',
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      { content: 'Found the merchant.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      onStep: (step) => steps.push({ type: step.type, toolName: step.toolName }),
    });

    await agent.run('Discover this merchant');

    expect(steps.some(s => s.type === 'thinking')).toBe(true);
    expect(steps.some(s => s.type === 'tool_call' && s.toolName === 'discover_merchant')).toBe(true);
    expect(steps.some(s => s.type === 'tool_result')).toBe(true);
  });

  it('should respect maxIterations limit', async () => {
    // LLM that always wants to call more tools
    const llm = new ScriptedLlm(
      Array.from({ length: 50 }, (_, i) => ({
        toolCalls: [{
          id: `call_${i}`,
          name: 'browse_products',
          arguments: { page: i + 1 },
        }],
      }))
    );

    const agent = new ShoppingAgent({
      llm,
      maxIterations: 3,
      clientOptions: { timeoutMs: 5000 },
    });

    // Need to discover first for browse_products to work
    // Since first call is browse (no discover), it'll error but still iterate
    const result = await agent.run('Browse everything');

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.answer).toContain('maximum iterations');
  });

  it('should handle tool execution errors gracefully', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'get_product',
          arguments: { productId: 'nonexistent' },
        }],
      },
      {
        content: 'The product was not found.',
      },
    ]);

    // No discovery = callApi will fail
    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('Get a nonexistent product');

    expect(result.success).toBe(true);
    // The agent should handle the error and still produce an answer
    expect(result.steps.some(s =>
      s.type === 'tool_result' && JSON.stringify(s.toolOutput).includes('error')
    )).toBe(true);
  });

  it('should manage cart state', async () => {
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
          arguments: { productId: 'prod_webcam', quantity: 2 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'add_to_cart',
          arguments: { productId: 'prod_usb_hub', quantity: 1 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'view_cart',
          arguments: {},
        }],
      },
      {
        toolCalls: [{
          id: 'call_5',
          name: 'remove_from_cart',
          arguments: { productId: 'prod_usb_hub' },
        }],
      },
      { content: 'Cart updated.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    await agent.run('Add webcam and usb hub to cart, then remove the hub');

    const cart = agent.getCart();
    expect(cart.itemCount).toBe(2); // 2x webcam
    expect(cart.items).toHaveLength(1); // 1 line item
    expect(cart.items[0].productId).toBe('prod_webcam');
  });
});
