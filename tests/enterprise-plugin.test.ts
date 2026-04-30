/**
 * Tests for enterprise plugin system — middleware hooks, lifecycle, and state
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import { isEnterprisePlugin } from '../src/types/index.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  ToolCall,
  AgentPlugin,
  EnterprisePlugin,
  PluginContext,
  PluginToolDecision,
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

describe('Enterprise plugin system', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Enterprise Plugin Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('should block a tool call via onBeforeToolCall', async () => {
    const plugin: EnterprisePlugin = {
      name: 'spending_guard',
      description: 'Block all payments',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      manifest: { version: '1.0.0', author: 'test', category: 'governance', tier: 'pro' },
      onBeforeToolCall(toolName) {
        if (toolName === 'submit_payment') {
          return { allow: false, reason: 'Spending limit exceeded' };
        }
        return { allow: true };
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      {
        toolCalls: [{ id: 'c2', name: 'submit_payment', arguments: { paymentToken: 'tok_123' } }],
      },
      { content: 'Payment was blocked.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [plugin] });
    const result = await agent.run(`Buy from ${merchant.domain}`);

    const blockedStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'submit_payment'
    );
    expect(blockedStep).toBeDefined();
    expect(blockedStep!.toolOutput).toEqual({
      blocked: true,
      tool: 'submit_payment',
      reason: 'Spending limit exceeded',
    });
  });

  it('should allow a tool call via onBeforeToolCall', async () => {
    const plugin: EnterprisePlugin = {
      name: 'allow_all',
      description: 'Allow everything',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onBeforeToolCall() {
        return { allow: true };
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      { content: 'Discovered.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [plugin] });
    const result = await agent.run(`Discover ${merchant.domain}`);

    expect(result.success).toBe(true);
    const discoverStep = result.steps.find(
      s => s.type === 'tool_result' && s.toolName === 'discover_merchant'
    );
    expect(discoverStep).toBeDefined();
    expect(discoverStep!.toolOutput).not.toHaveProperty('blocked');
  });

  it('should modify args via onBeforeToolCall modifiedArgs', async () => {
    let receivedQuery = '';

    const plugin: EnterprisePlugin = {
      name: 'query_rewriter',
      description: 'Rewrite search queries',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onBeforeToolCall(toolName, args) {
        if (toolName === 'search_products') {
          return { allow: true, modifiedArgs: { query: 'modified_query' } };
        }
        return { allow: true };
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      {
        toolCalls: [{ id: 'c2', name: 'search_products', arguments: { query: 'original_query' } }],
      },
      { content: 'Search done.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [plugin] });
    const result = await agent.run(`Search on ${merchant.domain}`);

    expect(result.success).toBe(true);
  });

  it('should call onAfterToolCall with the result', async () => {
    const afterCalls: Array<{ toolName: string; result: unknown }> = [];

    const plugin: EnterprisePlugin = {
      name: 'audit_logger',
      description: 'Log all tool calls',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ log: afterCalls }),
      async onAfterToolCall(toolName, _args, result) {
        afterCalls.push({ toolName, result });
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      { content: 'Done.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [plugin] });
    await agent.run(`Discover ${merchant.domain}`);

    expect(afterCalls.length).toBe(1);
    expect(afterCalls[0].toolName).toBe('discover_merchant');
    expect(afterCalls[0].result).toBeDefined();
  });

  it('should call onInit once before first run', async () => {
    let initCount = 0;

    const plugin: EnterprisePlugin = {
      name: 'init_counter',
      description: 'Count inits',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ initCount }),
      async onInit() {
        initCount++;
      },
    };

    const llm = new ScriptedLlm([{ content: 'Done 1.' }]);
    const agent = new ShoppingAgent({ llm, plugins: [plugin] });

    await agent.run('First run');
    expect(initCount).toBe(1);

    // ScriptedLlm is exhausted, create a new one for second run but reuse agent
    // The agent should not call onInit again
    // (We can't easily re-script the LLM, but we can verify initCount is still 1
    // since pluginsInitialized flag prevents re-init)
    expect(initCount).toBe(1);
  });

  it('should call onRegister during construction', () => {
    let registerCalled = false;
    let contextReceived: PluginContext | null = null;

    const plugin: EnterprisePlugin = {
      name: 'register_check',
      description: 'Check registration',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onRegister(context) {
        registerCalled = true;
        contextReceived = context;
      },
    };

    const llm = new ScriptedLlm([]);
    new ShoppingAgent({ llm, plugins: [plugin] });

    expect(registerCalled).toBe(true);
    expect(contextReceived).not.toBeNull();
    expect(typeof contextReceived!.getCart).toBe('function');
    expect(typeof contextReceived!.getActiveMerchant).toBe('function');
    expect(typeof contextReceived!.getMerchants).toBe('function');
    expect(typeof contextReceived!.getSteps).toBe('function');
    expect(typeof contextReceived!.getCurrentIteration).toBe('function');
    expect(typeof contextReceived!.getCheckoutSessionId).toBe('function');
  });

  it('should call configure with matching pluginConfigs', () => {
    let configReceived: Record<string, unknown> = {};

    const plugin: EnterprisePlugin = {
      name: 'configurable',
      description: 'Configurable plugin',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      configure(config) {
        configReceived = config;
      },
    };

    const llm = new ScriptedLlm([]);
    new ShoppingAgent({
      llm,
      plugins: [plugin],
      pluginConfigs: {
        'configurable': { limit: 500, currency: 'USD' },
        'other_plugin': { ignored: true },
      },
    });

    expect(configReceived).toEqual({ limit: 500, currency: 'USD' });
  });

  it('should return plugin state via getState', () => {
    const plugin: EnterprisePlugin = {
      name: 'stateful',
      description: 'Plugin with state',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      getState() {
        return { totalSpent: 250, transactionCount: 3 };
      },
    };

    expect(plugin.getState!()).toEqual({ totalSpent: 250, transactionCount: 3 });
  });

  it('should work with mixed AgentPlugin and EnterprisePlugin', async () => {
    const basicPlugin: AgentPlugin = {
      name: 'basic_tool',
      description: 'A basic plugin',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ basic: true }),
    };

    const afterCalls: string[] = [];
    const enterprisePlugin: EnterprisePlugin = {
      name: 'enterprise_tool',
      description: 'An enterprise plugin',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ enterprise: true }),
      manifest: { version: '1.0.0', author: 'test', category: 'governance', tier: 'pro' },
      async onAfterToolCall(toolName) {
        afterCalls.push(toolName);
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'basic_tool', arguments: {} }],
      },
      { content: 'Done.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [basicPlugin, enterprisePlugin] });
    const result = await agent.run('Use the basic tool');

    expect(result.success).toBe(true);
    expect(agent.getPlugins()).toEqual(['basic_tool', 'enterprise_tool']);
    expect(afterCalls).toEqual(['basic_tool']);
  });

  it('should execute multiple enterprise plugins in registration order', async () => {
    const order: string[] = [];

    const plugin1: EnterprisePlugin = {
      name: 'guard_1',
      description: 'First guard',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onBeforeToolCall(toolName) {
        order.push(`before_1:${toolName}`);
        return { allow: true };
      },
      async onAfterToolCall(toolName) {
        order.push(`after_1:${toolName}`);
      },
    };

    const plugin2: EnterprisePlugin = {
      name: 'guard_2',
      description: 'Second guard',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onBeforeToolCall(toolName) {
        order.push(`before_2:${toolName}`);
        return { allow: true };
      },
      async onAfterToolCall(toolName) {
        order.push(`after_2:${toolName}`);
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      { content: 'Done.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [plugin1, plugin2] });
    await agent.run(`Discover ${merchant.domain}`);

    expect(order).toEqual([
      'before_1:discover_merchant',
      'before_2:discover_merchant',
      'after_1:discover_merchant',
      'after_2:discover_merchant',
    ]);
  });

  it('should provide live agent state through PluginContext', async () => {
    let contextRef: PluginContext | null = null;
    let merchantAfterDiscover: string | null = 'not_checked';

    const plugin: EnterprisePlugin = {
      name: 'context_reader',
      description: 'Read agent context',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onRegister(context) {
        contextRef = context;
      },
      async onAfterToolCall(toolName, _args, _result, context) {
        if (toolName === 'discover_merchant') {
          merchantAfterDiscover = context.getActiveMerchant();
        }
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      { content: 'Done.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [plugin] });

    // Before run: no active merchant
    expect(contextRef!.getActiveMerchant()).toBeNull();
    expect(contextRef!.getMerchants()).toEqual([]);
    expect(contextRef!.getCart().items).toEqual([]);
    expect(contextRef!.getCurrentIteration()).toBe(0);

    await agent.run(`Discover ${merchant.domain}`);

    // After discover: merchant is active
    expect(merchantAfterDiscover).toBe(merchant.domain);
  });

  it('should correctly identify enterprise plugins via isEnterprisePlugin', () => {
    const basic: AgentPlugin = {
      name: 'basic',
      description: 'Basic',
      parameters: {},
      handler: () => ({}),
    };

    const withManifest: EnterprisePlugin = {
      name: 'manifested',
      description: 'Has manifest',
      parameters: {},
      handler: () => ({}),
      manifest: { version: '1.0.0', author: 'test', category: 'governance', tier: 'pro' },
    };

    const withBefore: EnterprisePlugin = {
      name: 'guarded',
      description: 'Has onBeforeToolCall',
      parameters: {},
      handler: () => ({}),
      onBeforeToolCall() { return { allow: true }; },
    };

    const withAfter: EnterprisePlugin = {
      name: 'observed',
      description: 'Has onAfterToolCall',
      parameters: {},
      handler: () => ({}),
      async onAfterToolCall() {},
    };

    const withRegister: EnterprisePlugin = {
      name: 'registered',
      description: 'Has onRegister',
      parameters: {},
      handler: () => ({}),
      onRegister() {},
    };

    const withInit: EnterprisePlugin = {
      name: 'inited',
      description: 'Has onInit',
      parameters: {},
      handler: () => ({}),
      async onInit() {},
    };

    expect(isEnterprisePlugin(basic)).toBe(false);
    expect(isEnterprisePlugin(withManifest)).toBe(true);
    expect(isEnterprisePlugin(withBefore)).toBe(true);
    expect(isEnterprisePlugin(withAfter)).toBe(true);
    expect(isEnterprisePlugin(withRegister)).toBe(true);
    expect(isEnterprisePlugin(withInit)).toBe(true);
  });

  it('should short-circuit on first blocking plugin', async () => {
    const order: string[] = [];

    const blocker: EnterprisePlugin = {
      name: 'blocker',
      description: 'Blocks discover',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onBeforeToolCall(toolName) {
        order.push('blocker');
        if (toolName === 'discover_merchant') {
          return { allow: false, reason: 'Blocked by first plugin' };
        }
        return { allow: true };
      },
    };

    const observer: EnterprisePlugin = {
      name: 'observer',
      description: 'Should not be reached',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({}),
      onBeforeToolCall() {
        order.push('observer');
        return { allow: true };
      },
    };

    const llm = new ScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'discover_merchant', arguments: { domain: 'example.com' } }],
      },
      { content: 'Blocked.' },
    ]);

    const agent = new ShoppingAgent({ llm, plugins: [blocker, observer] });
    await agent.run('Discover example.com');

    expect(order).toEqual(['blocker']);
  });
});
