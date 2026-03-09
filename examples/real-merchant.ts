/**
 * Real Merchant — Shopify Store Agent
 *
 * Demonstrates connecting an agorio agent to a REAL Shopify store
 * using the ShopifyAdapter. The agent can browse and search actual
 * product catalogs from live Shopify stores.
 *
 * Prerequisites:
 *   - A Shopify store with Storefront API enabled
 *   - A Storefront API access token
 *
 * Environment variables:
 *   SHOPIFY_STORE=your-store-handle
 *   SHOPIFY_STOREFRONT_TOKEN=your-storefront-access-token
 *   GEMINI_API_KEY=your-gemini-key (or use any LLM adapter)
 *
 * Run: npx tsx examples/real-merchant.ts
 */

import {
  ShoppingAgent,
  ShopifyAdapter,
} from '../src/index.js';
import type { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCall } from '../src/index.js';

// ─── Scripted LLM (for demo without an API key) ───

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-shopify-demo';
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

// ─── Main ───

async function main() {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;

  if (!store || !token) {
    console.log('=== Real Merchant Demo (Shopify) ===\n');
    console.log('This example connects to a REAL Shopify store.\n');
    console.log('To run it, set these environment variables:');
    console.log('  SHOPIFY_STORE=your-store-handle');
    console.log('  SHOPIFY_STOREFRONT_TOKEN=your-storefront-access-token\n');
    console.log('Example:');
    console.log('  SHOPIFY_STORE=hydrogen-preview SHOPIFY_STOREFRONT_TOKEN=abc123 npx tsx examples/real-merchant.ts\n');
    console.log('---\n');
    console.log('Running demo with a mock Shopify adapter instead...\n');
    return runMockDemo();
  }

  console.log(`=== Real Merchant: ${store}.myshopify.com ===\n`);

  const adapter = new ShopifyAdapter({
    store,
    storefrontAccessToken: token,
  });

  const domain = `${store}.myshopify.com`;

  // Script: discover → browse → search → done
  const llm = new ScriptedLlm([
    {
      content: `Let me connect to ${domain}...`,
      toolCalls: [{
        id: 'call_1',
        name: 'discover_merchant',
        arguments: { domain },
      }],
    },
    {
      content: 'Let me browse the product catalog...',
      toolCalls: [{
        id: 'call_2',
        name: 'browse_products',
        arguments: { limit: 5 },
      }],
    },
    {
      content: 'Now let me search for something specific...',
      toolCalls: [{
        id: 'call_3',
        name: 'search_products',
        arguments: { query: 'shirt', limit: 3 },
      }],
    },
    {
      content: 'Here are the results from the real Shopify store! The agent successfully browsed and searched actual products.',
    },
  ]);

  const agent = new ShoppingAgent({
    llm,
    adapters: [adapter],
    verbose: true,
    onStep: (step) => {
      if (step.type === 'tool_result' && step.toolOutput) {
        const output = JSON.stringify(step.toolOutput, null, 2);
        console.log(`\n  [Result] ${output.slice(0, 500)}${output.length > 500 ? '...' : ''}\n`);
      }
    },
  });

  const result = await agent.run(`Browse products on ${domain} and search for shirts`);

  console.log('\n--- Final Answer ---');
  console.log(result.answer);
  console.log(`\nCompleted in ${result.iterations} iterations.`);
  console.log(`Merchant discovered: ${result.merchant?.domain ?? 'none'}`);
}

/**
 * Demo with a mock adapter that simulates Shopify behavior.
 */
async function runMockDemo() {
  // Import MockMerchant for the fallback demo
  const { MockMerchant } = await import('../src/mock/mock-merchant.js');

  const merchant = new MockMerchant({ name: 'Demo Shopify Store' });
  await merchant.start();

  console.log(`Mock merchant running at ${merchant.domain}\n`);

  const llm = new ScriptedLlm([
    {
      content: 'Discovering the merchant...',
      toolCalls: [{
        id: 'call_1',
        name: 'discover_merchant',
        arguments: { domain: merchant.domain },
      }],
    },
    {
      content: 'Browsing products...',
      toolCalls: [{
        id: 'call_2',
        name: 'browse_products',
        arguments: { limit: 3 },
      }],
    },
    {
      content: `Found products from the mock store! In a real scenario, replace MockMerchant with ShopifyAdapter to browse actual Shopify stores.

To connect to a real store:
  const adapter = new ShopifyAdapter({
    store: 'your-store',
    storefrontAccessToken: 'your-token',
  });

  const agent = new ShoppingAgent({
    llm: new GeminiAdapter({ apiKey: '...' }),
    adapters: [adapter],
  });`,
    },
  ]);

  const agent = new ShoppingAgent({ llm, verbose: true });
  const result = await agent.run(`Browse products on ${merchant.domain}`);

  console.log('\n--- Result ---');
  console.log(result.answer);

  await merchant.stop();
}

main().catch(console.error);
