/**
 * Price Comparison — Dual-Protocol Agent (UCP + ACP)
 *
 * Searches for a product across a UCP merchant and an ACP merchant,
 * demonstrating dual-protocol support. The agent auto-detects which
 * protocol each merchant uses.
 *
 * Demonstrates: dual-protocol (UCP + ACP), auto-detection, cross-protocol search
 *
 * Run: npx tsx examples/price-comparison.ts
 */

import {
  ShoppingAgent,
  MockMerchant,
  MockAcpMerchant,
} from '../src/index.js';
import type { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCall } from '../src/index.js';

// ─── Scripted LLM ───

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-price-compare';
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
  console.log('=== Price Comparison Agent (Dual Protocol) ===\n');
  console.log('Comparing keyboard prices across UCP and ACP merchants...\n');

  // Start one UCP merchant and one ACP merchant
  const ucpMerchant = new MockMerchant({ name: 'UCP TechStore' });
  const acpMerchant = new MockAcpMerchant({ name: 'ACP GearShop' });

  await ucpMerchant.start();
  await acpMerchant.start();

  console.log(`UCP Merchant: ${ucpMerchant.domain} (UCP TechStore)`);
  console.log(`ACP Merchant: ${acpMerchant.domain} (ACP GearShop)`);
  console.log('');

  // Script: discover UCP merchant, search, discover ACP merchant, search, compare
  const llm = new ScriptedLlm([
    // Step 1: Discover UCP merchant
    {
      content: 'Discovering UCP TechStore via /.well-known/ucp...',
      toolCalls: [{
        id: 'call_1',
        name: 'discover_merchant',
        arguments: { domain: ucpMerchant.domain },
      }],
    },
    // Step 2: Search for keyboards on UCP merchant
    {
      content: 'Searching for keyboards on UCP TechStore...',
      toolCalls: [{
        id: 'call_2',
        name: 'search_products',
        arguments: { query: 'keyboard' },
      }],
    },
    // Step 3: Get detailed product info
    {
      content: 'Getting details on the mechanical keyboard...',
      toolCalls: [{
        id: 'call_3',
        name: 'get_product',
        arguments: { productId: 'prod_mechanical_keyboard' },
      }],
    },
    // Step 4: Discover ACP merchant (agent auto-detects protocol)
    {
      content: 'Now discovering ACP GearShop (agent will auto-detect ACP protocol)...',
      toolCalls: [{
        id: 'call_4',
        name: 'discover_merchant',
        arguments: { domain: acpMerchant.domain },
      }],
    },
    // Step 5: Search for keyboards on ACP merchant
    {
      content: 'Searching for keyboards on ACP GearShop...',
      toolCalls: [{
        id: 'call_5',
        name: 'search_products',
        arguments: { query: 'keyboard' },
      }],
    },
    // Step 6: Final comparison
    {
      content: `Here's the cross-protocol price comparison:

┌───────────────────────────────────────────────────────────────────┐
│ Product: TypePro Mechanical Keyboard                              │
├────────────────┬──────────┬──────────┬────────────────────────────┤
│ Merchant       │ Protocol │ Price    │ Status                     │
├────────────────┼──────────┼──────────┼────────────────────────────┤
│ UCP TechStore  │ UCP      │ $89.99   │ In stock (Cherry MX Brown) │
│ ACP GearShop   │ ACP      │ $89.99   │ In stock (Cherry MX Brown) │
└────────────────┴──────────┴──────────┴────────────────────────────┘

Both merchants carry the same TypePro Mechanical Keyboard at $89.99. The key difference is the protocol:

- UCP TechStore: Discovered via /.well-known/ucp (Google/Shopify protocol)
- ACP GearShop: Discovered via ACP endpoint (OpenAI/Stripe protocol)

The Agorio SDK auto-detected the correct protocol for each merchant. With a real LLM, this agent would handle merchants using either protocol seamlessly.`,
    },
  ]);

  const agent = new ShoppingAgent({
    llm,
    acpOptions: {
      endpoint: acpMerchant.acpEndpoint,
      apiKey: acpMerchant.requiredApiKey,
    },
    verbose: true,
    onStep: (step) => {
      if (step.type === 'tool_call') {
        console.log(`  [Tool] ${step.toolName}(${JSON.stringify(step.toolInput)})`);
      } else if (step.type === 'tool_result') {
        const output = typeof step.toolOutput === 'string'
          ? step.toolOutput.slice(0, 120) + '...'
          : JSON.stringify(step.toolOutput).slice(0, 120) + '...';
        console.log(`  [Result] ${output}`);
      } else if (step.content) {
        console.log(`  [Agent] ${step.content}`);
      }
    },
  });

  const result = await agent.run(
    `Compare keyboard prices between ${ucpMerchant.domain} (UCP) and ${acpMerchant.domain} (ACP).`,
  );

  console.log('\n--- Final Answer ---');
  console.log(result.answer);
  console.log(`\nCompleted in ${result.iterations} iterations.`);
  console.log(`Success: ${result.success}`);

  // Cleanup
  await ucpMerchant.stop();
  await acpMerchant.stop();
}

main().catch(console.error);
