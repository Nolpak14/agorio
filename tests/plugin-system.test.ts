/**
 * Tests for plugin system - custom tool registration and execution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  ToolCall,
  AgentPlugin,
} from '../src/types/index.js';

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-mock';
  private callIndex = 0;
  private readonly script: Array<{
    content?: string;
    toolCalls?: ToolCall[];
  }>;
  public receivedTools: ToolDefinition[] = [];

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse> {
    if (tools) this.receivedTools = tools;
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

describe('Plugin system', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Plugin Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('should register plugins and expose them via getPlugins()', () => {
    const llm = new ScriptedLlm([{ content: 'Done.' }]);
    const agent = new ShoppingAgent({
      llm,
      plugins: [
        {
          name: 'check_reviews',
          description: 'Check product reviews',
          parameters: { type: 'object', properties: { productId: { type: 'string' } } },
          handler: async () => ({ rating: 4.5, count: 128 }),
        },
        {
          name: 'check_inventory',
          description: 'Check warehouse inventory',
          parameters: { type: 'object', properties: { sku: { type: 'string' } } },
          handler: async () => ({ available: true, quantity: 42 }),
        },
      ],
    });

    expect(agent.getPlugins()).toEqual(['check_reviews', 'check_inventory']);
  });

  it('should include plugin tools in LLM function calling', async () => {
    const llm = new ScriptedLlm([{ content: 'Done.' }]);

    const agent = new ShoppingAgent({
      llm,
      plugins: [
        {
          name: 'check_reviews',
          description: 'Check product reviews and ratings',
          parameters: {
            type: 'object',
            properties: { productId: { type: 'string' } },
            required: ['productId'],
          },
          handler: async () => ({ rating: 4.5 }),
        },
      ],
    });

    await agent.run('Hello');

    // The LLM should have received 13 tools (12 built-in + 1 plugin)
    expect(llm.receivedTools.length).toBe(13);
    const pluginTool = llm.receivedTools.find(t => t.name === 'check_reviews');
    expect(pluginTool).toBeDefined();
    expect(pluginTool!.description).toBe('Check product reviews and ratings');
    expect(pluginTool!.parameters).toHaveProperty('properties');
  });

  it('should execute a plugin handler when LLM calls it', async () => {
    let handlerCalled = false;
    let receivedArgs: Record<string, unknown> = {};

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
          name: 'check_reviews',
          arguments: { productId: 'prod_wireless_headphones' },
        }],
      },
      {
        content: 'The headphones have a 4.5 rating with 128 reviews.',
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      plugins: [
        {
          name: 'check_reviews',
          description: 'Check product reviews',
          parameters: {
            type: 'object',
            properties: { productId: { type: 'string' } },
            required: ['productId'],
          },
          handler: async (args) => {
            handlerCalled = true;
            receivedArgs = args;
            return { rating: 4.5, count: 128, productId: args.productId };
          },
        },
      ],
    });

    const result = await agent.run(
      `Check reviews for headphones on ${merchant.domain}`
    );

    expect(result.success).toBe(true);
    expect(handlerCalled).toBe(true);
    expect(receivedArgs.productId).toBe('prod_wireless_headphones');
    // Verify the tool result was recorded in steps
    expect(result.steps.some(s =>
      s.type === 'tool_result' &&
      s.toolName === 'check_reviews' &&
      JSON.stringify(s.toolOutput).includes('4.5')
    )).toBe(true);
  });

  it('should handle synchronous plugin handlers', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'get_loyalty_points',
          arguments: { userId: 'user_123' },
        }],
      },
      {
        content: 'You have 500 loyalty points.',
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      plugins: [
        {
          name: 'get_loyalty_points',
          description: 'Get loyalty points balance',
          parameters: {
            type: 'object',
            properties: { userId: { type: 'string' } },
          },
          handler: (args) => ({ points: 500, userId: args.userId }),
        },
      ],
    });

    const result = await agent.run('Check my loyalty points');

    expect(result.success).toBe(true);
    expect(result.steps.some(s =>
      s.type === 'tool_result' &&
      s.toolName === 'get_loyalty_points' &&
      JSON.stringify(s.toolOutput).includes('500')
    )).toBe(true);
  });

  it('should handle plugin handler errors gracefully', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'flaky_tool',
          arguments: {},
        }],
      },
      {
        content: 'The tool failed, but I can handle it.',
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      plugins: [
        {
          name: 'flaky_tool',
          description: 'A tool that always fails',
          parameters: { type: 'object', properties: {} },
          handler: async () => {
            throw new Error('Service unavailable');
          },
        },
      ],
    });

    const result = await agent.run('Try the flaky tool');

    expect(result.success).toBe(true);
    expect(result.steps.some(s =>
      s.type === 'tool_result' &&
      s.toolName === 'flaky_tool' &&
      JSON.stringify(s.toolOutput).includes('Service unavailable')
    )).toBe(true);
  });

  it('should throw on plugin name collision with built-in tools', () => {
    const llm = new ScriptedLlm([]);
    expect(() => {
      new ShoppingAgent({
        llm,
        plugins: [
          {
            name: 'browse_products', // conflicts with built-in
            description: 'Custom browse',
            parameters: { type: 'object', properties: {} },
            handler: async () => ({}),
          },
        ],
      });
    }).toThrow('conflicts with a built-in tool');
  });

  it('should throw on duplicate plugin names', () => {
    const llm = new ScriptedLlm([]);
    expect(() => {
      new ShoppingAgent({
        llm,
        plugins: [
          {
            name: 'custom_tool',
            description: 'First',
            parameters: { type: 'object', properties: {} },
            handler: async () => ({}),
          },
          {
            name: 'custom_tool',
            description: 'Duplicate',
            parameters: { type: 'object', properties: {} },
            handler: async () => ({}),
          },
        ],
      });
    }).toThrow('Duplicate plugin name');
  });

  it('should work with zero plugins (backward compatible)', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      { content: 'Found the merchant.' },
    ]);

    const agent = new ShoppingAgent({ llm });
    const result = await agent.run(`Discover ${merchant.domain}`);

    expect(result.success).toBe(true);
    expect(agent.getPlugins()).toEqual([]);
    expect(llm.receivedTools.length).toBe(12); // Only built-in tools
  });

  it('should use multiple plugins together in a flow', async () => {
    const callLog: string[] = [];

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
        toolCalls: [{
          id: 'call_3',
          name: 'check_reviews',
          arguments: { productId: 'prod_wireless_headphones' },
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'price_alert',
          arguments: { productId: 'prod_wireless_headphones', targetPrice: 99.99 },
        }],
      },
      {
        content: 'The headphones are rated 4.5/5 and I set a price alert for $99.99.',
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      plugins: [
        {
          name: 'check_reviews',
          description: 'Check product reviews',
          parameters: {
            type: 'object',
            properties: { productId: { type: 'string' } },
          },
          handler: async (args) => {
            callLog.push(`check_reviews:${args.productId}`);
            return { rating: 4.5, count: 128 };
          },
        },
        {
          name: 'price_alert',
          description: 'Set a price alert',
          parameters: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              targetPrice: { type: 'number' },
            },
          },
          handler: async (args) => {
            callLog.push(`price_alert:${args.productId}@${args.targetPrice}`);
            return { success: true, alertId: 'alert_001' };
          },
        },
      ],
    });

    const result = await agent.run(
      `Search for headphones on ${merchant.domain}, check reviews, and set a price alert for $99.99`
    );

    expect(result.success).toBe(true);
    expect(callLog).toEqual([
      'check_reviews:prod_wireless_headphones',
      'price_alert:prod_wireless_headphones@99.99',
    ]);
    expect(llm.receivedTools.length).toBe(14); // 12 built-in + 2 plugins
  });
});
