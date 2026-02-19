/**
 * Deal Finder — Multi-Merchant Price Comparison Agent
 *
 * Discovers multiple UCP merchants, searches for a product across all of them,
 * compares prices, and recommends the best deal.
 *
 * Demonstrates: multi-merchant discovery, product search, price comparison
 *
 * Run: npx tsx examples/deal-finder.ts
 */

import {
  ShoppingAgent,
  MockMerchant,
} from '../src/index.js';
import type { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCall } from '../src/index.js';

// ─── Scripted LLM (simulates a real LLM for demo purposes) ───

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-deal-finder';
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
  console.log('=== Deal Finder Agent ===\n');
  console.log('Searching for the best headphone deal across multiple merchants...\n');

  // Start two mock merchants with different pricing
  const merchant1 = new MockMerchant({ name: 'TechDirect' });
  const merchant2 = new MockMerchant({ name: 'GadgetWorld' });

  await merchant1.start();
  await merchant2.start();

  console.log(`Merchant 1: ${merchant1.domain} (TechDirect)`);
  console.log(`Merchant 2: ${merchant2.domain} (GadgetWorld)\n`);

  // Script the agent to:
  // 1. Discover first merchant
  // 2. Search for headphones on first merchant
  // 3. Discover second merchant
  // 4. Search for headphones on second merchant
  // 5. Compare and recommend
  const llm = new ScriptedLlm([
    // Step 1: Discover first merchant
    {
      content: 'Let me check TechDirect first.',
      toolCalls: [{
        id: 'call_1',
        name: 'discover_merchant',
        arguments: { domain: merchant1.domain },
      }],
    },
    // Step 2: Search headphones on first merchant
    {
      content: 'Searching for headphones on TechDirect...',
      toolCalls: [{
        id: 'call_2',
        name: 'search_products',
        arguments: { query: 'headphones' },
      }],
    },
    // Step 3: Discover second merchant
    {
      content: 'Now let me check GadgetWorld.',
      toolCalls: [{
        id: 'call_3',
        name: 'discover_merchant',
        arguments: { domain: merchant2.domain },
      }],
    },
    // Step 4: Search headphones on second merchant
    {
      content: 'Searching for headphones on GadgetWorld...',
      toolCalls: [{
        id: 'call_4',
        name: 'search_products',
        arguments: { query: 'headphones' },
      }],
    },
    // Step 5: Final recommendation
    {
      content: `Here's my deal comparison:

┌─────────────────────────────────────────────────────────────┐
│ Product: ProSound Wireless Headphones                       │
├─────────────┬───────────┬───────────────────────────────────┤
│ Merchant    │ Price     │ Notes                             │
├─────────────┼───────────┼───────────────────────────────────┤
│ TechDirect  │ $149.99   │ In stock, free shipping over $50  │
│ GadgetWorld │ $149.99   │ In stock, free shipping over $50  │
└─────────────┴───────────┴───────────────────────────────────┘

Both merchants offer the same price ($149.99). Since they're identical, I'd recommend going with whichever merchant you prefer. Both have the item in stock and offer free shipping on this order.

Tip: With a real LLM, the agent would dynamically compare prices, check shipping costs, and factor in loyalty programs or coupons.`,
    },
  ]);

  const agent = new ShoppingAgent({
    llm,
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
    `Find the best deal on wireless headphones. Check both ${merchant1.domain} and ${merchant2.domain}.`,
  );

  console.log('\n--- Final Answer ---');
  console.log(result.answer);
  console.log(`\nCompleted in ${result.iterations} iterations.`);

  // Cleanup
  await merchant1.stop();
  await merchant2.stop();
}

main().catch(console.error);
