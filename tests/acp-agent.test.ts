/**
 * Tests for ShoppingAgent with ACP protocol support
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockAcpMerchant } from '../src/mock/mock-acp-merchant.js';
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

describe('ShoppingAgent with ACP', () => {
  let acpMerchant: MockAcpMerchant;

  beforeAll(async () => {
    acpMerchant = new MockAcpMerchant({ name: 'ACP Agent Test Store' });
    await acpMerchant.start();
  });

  afterAll(async () => {
    await acpMerchant.stop();
  });

  it('should discover an ACP merchant when UCP fails', async () => {
    const llm = new ScriptedLlm([
      {
        content: 'Discovering merchant...',
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: acpMerchant.domain },
        }],
      },
      {
        content: `Found ACP merchant at ${acpMerchant.domain} with checkout capability.`,
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run(`Discover ${acpMerchant.domain}`);
    expect(result.success).toBe(true);

    // Verify discovery returned ACP info
    const discoverStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'discover_merchant'
    );
    expect(discoverStep).toBeDefined();
    const output = discoverStep!.toolOutput as Record<string, unknown>;
    expect(output.protocol).toBe('acp');
  });

  it('should browse products on ACP merchant', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: acpMerchant.domain },
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
        content: 'Found products on the ACP merchant.',
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run('Browse products');
    expect(result.success).toBe(true);

    const browseStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'browse_products'
    );
    const output = browseStep!.toolOutput as Record<string, unknown>;
    expect((output.products as unknown[]).length).toBeGreaterThan(0);
  });

  it('should search products on ACP merchant', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: acpMerchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'search_products',
          arguments: { query: 'keyboard' },
        }],
      },
      { content: 'Found keyboards.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run('Search for keyboards');
    expect(result.success).toBe(true);
  });

  it('should complete a full ACP checkout flow', async () => {
    const llm = new ScriptedLlm([
      // 1. Discover
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: acpMerchant.domain },
        }],
      },
      // 2. Add to cart
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_laptop_stand', quantity: 1 },
        }],
      },
      // 3. Initiate checkout (ACP: creates checkout session)
      {
        toolCalls: [{
          id: 'call_3',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      // 4. Submit shipping (ACP: updates checkout session)
      {
        toolCalls: [{
          id: 'call_4',
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
      // 5. Submit payment (ACP: completes checkout session)
      {
        toolCalls: [{
          id: 'call_5',
          name: 'submit_payment',
          arguments: {
            paymentMethod: 'stripe_shared_payment_token',
            paymentToken: 'tok_mock_success',
          },
        }],
      },
      // 6. Final answer
      { content: 'Order placed via ACP!' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run(
      `Buy a laptop stand from ${acpMerchant.domain}`
    );

    expect(result.success).toBe(true);
    expect(result.checkout).toBeDefined();
    expect(result.checkout!.orderId).toMatch(/^acp_cs_/);
    expect(result.checkout!.status).toBe('completed');
    expect(result.iterations).toBe(6);
  });

  it('should list ACP capabilities', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: acpMerchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'list_capabilities',
          arguments: {},
        }],
      },
      { content: 'ACP merchant supports checkout.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run('List capabilities');
    expect(result.success).toBe(true);

    const capStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'list_capabilities'
    );
    const output = capStep!.toolOutput as Record<string, unknown>;
    const caps = output.capabilities as Array<{ name: string }>;
    expect(caps.some(c => c.name === 'acp.checkout')).toBe(true);
  });
});

describe('Protocol detection (UCP vs ACP)', () => {
  let ucpMerchant: MockMerchant;
  let acpMerchant: MockAcpMerchant;

  beforeAll(async () => {
    ucpMerchant = new MockMerchant({ name: 'UCP Store' });
    acpMerchant = new MockAcpMerchant({ name: 'ACP Store' });
    await ucpMerchant.start();
    await acpMerchant.start();
  });

  afterAll(async () => {
    await ucpMerchant.stop();
    await acpMerchant.stop();
  });

  it('should prefer UCP when both are available', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: ucpMerchant.domain },
        }],
      },
      { content: 'Found UCP merchant.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run('Discover UCP merchant');
    const discoverStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'discover_merchant'
    );
    const output = discoverStep!.toolOutput as Record<string, unknown>;
    expect(output.protocol).toBe('ucp');
  });

  it('should fall back to ACP when UCP is not available', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          // Use ACP merchant domain — has no /.well-known/ucp
          arguments: { domain: acpMerchant.domain },
        }],
      },
      { content: 'Found ACP merchant.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      acpOptions: {
        endpoint: acpMerchant.acpEndpoint,
        apiKey: acpMerchant.requiredApiKey,
      },
    });

    const result = await agent.run('Discover ACP merchant');
    const discoverStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'discover_merchant'
    );
    const output = discoverStep!.toolOutput as Record<string, unknown>;
    expect(output.protocol).toBe('acp');
  });

  it('should return error when neither protocol works', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: 'localhost:1' },
        }],
      },
      { content: 'Could not discover merchant.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      clientOptions: { timeoutMs: 1000 },
    });

    const result = await agent.run('Discover nonexistent');
    const discoverStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'discover_merchant'
    );
    const output = discoverStep!.toolOutput as Record<string, unknown>;
    expect(output.error).toBeDefined();
  });
});
