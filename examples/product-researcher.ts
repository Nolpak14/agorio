/**
 * Product Researcher — Streaming Agent with Deep Product Analysis
 *
 * Uses runStream() to provide real-time output as the agent browses products,
 * collects specs and pricing, and produces a summary report.
 *
 * Demonstrates: streaming (runStream()), product browsing, detailed analysis
 *
 * Run: npx tsx examples/product-researcher.ts
 */

import {
  ShoppingAgent,
  MockMerchant,
} from '../src/index.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  LlmStreamChunk,
  ToolCall,
  AgentStreamEvent,
} from '../src/index.js';

// ─── Streaming Scripted LLM (implements chatStream) ───

class StreamingScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-researcher';
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

  async *chatStream(_messages: ChatMessage[], _tools?: ToolDefinition[]): AsyncGenerator<LlmStreamChunk> {
    const step = this.script[this.callIndex++];
    if (!step) {
      yield { type: 'done', response: { content: 'Done.', toolCalls: [], finishReason: 'stop' } };
      return;
    }

    // Stream text character by character (simulates real streaming)
    const content = step.content ?? '';
    if (content) {
      const words = content.split(' ');
      for (const word of words) {
        yield { type: 'text_delta', text: word + ' ' };
        // Small delay would happen in real streaming
      }
    }

    // Stream tool calls
    if (step.toolCalls?.length) {
      for (const tc of step.toolCalls) {
        yield { type: 'tool_call_start', toolCallId: tc.id, toolName: tc.name };
        const args = JSON.stringify(tc.arguments);
        yield { type: 'tool_call_delta', toolCallId: tc.id, argsDelta: args };
        yield { type: 'tool_call_complete', toolCall: tc };
      }
    }

    yield {
      type: 'done',
      response: {
        content,
        toolCalls: step.toolCalls ?? [],
        finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
      },
    };
  }
}

// ─── Main ───

async function main() {
  console.log('=== Product Researcher Agent (Streaming) ===\n');
  console.log('Researching desk accessories with real-time streaming output...\n');

  const merchant = new MockMerchant({ name: 'OfficeHub' });
  await merchant.start();
  console.log(`Merchant: ${merchant.domain} (OfficeHub)\n`);

  // Script: browse products, get details on several desk items, produce report
  const llm = new StreamingScriptedLlm([
    // Step 1: Discover merchant
    {
      content: 'Starting research on OfficeHub desk accessories...',
      toolCalls: [{
        id: 'call_1',
        name: 'discover_merchant',
        arguments: { domain: merchant.domain },
      }],
    },
    // Step 2: Browse all products
    {
      content: 'Browsing the full product catalog...',
      toolCalls: [{
        id: 'call_2',
        name: 'browse_products',
        arguments: { limit: 20 },
      }],
    },
    // Step 3: Get details on desk mat
    {
      content: 'Investigating desk mat...',
      toolCalls: [{
        id: 'call_3',
        name: 'get_product',
        arguments: { productId: 'prod_desk_mat' },
      }],
    },
    // Step 4: Get details on monitor light
    {
      content: 'Checking monitor light...',
      toolCalls: [{
        id: 'call_4',
        name: 'get_product',
        arguments: { productId: 'prod_monitor_light' },
      }],
    },
    // Step 5: Get details on cable organizer
    {
      content: 'Looking at cable organizer...',
      toolCalls: [{
        id: 'call_5',
        name: 'get_product',
        arguments: { productId: 'prod_cable_organizer' },
      }],
    },
    // Step 6: Get details on laptop stand
    {
      content: 'Checking laptop stand...',
      toolCalls: [{
        id: 'call_6',
        name: 'get_product',
        arguments: { productId: 'prod_laptop_stand' },
      }],
    },
    // Step 7: Final research report
    {
      content: `
=== Desk Accessories Research Report ===
Merchant: OfficeHub | Protocol: UCP | Products analyzed: 4

┌──────────────────────────────┬─────────┬────────────┬───────────────────────────────┐
│ Product                      │ Price   │ Available  │ Key Feature                   │
├──────────────────────────────┼─────────┼────────────┼───────────────────────────────┤
│ WorkPad XL Desk Mat          │ $29.99  │ Yes        │ 900x400mm, waterproof leather │
│ GlowBar Monitor Light        │ $44.99  │ Yes        │ Asymmetric optics, USB-C      │
│ TidyDesk Cable Organizer     │ $12.99  │ Yes        │ Silicone, 5 cable slots       │
│ ErgoRise Laptop Stand        │ $59.99  │ Yes        │ Aluminum, adjustable height   │
└──────────────────────────────┴─────────┴────────────┴───────────────────────────────┘

Budget breakdown:
  - Essential setup (mat + organizer):     $42.98
  - Recommended setup (+ monitor light):   $87.97
  - Premium setup (+ laptop stand):        $147.96

Recommendation: Start with the WorkPad XL Desk Mat ($29.99) and TidyDesk Cable Organizer ($12.99) — they offer the most impact for $42.98. Add the GlowBar Monitor Light next for eye comfort during long sessions.

Note: This report was streamed in real-time using runStream(). Each word appeared as the agent generated it, and tool calls were visible as they happened.`,
    },
  ]);

  const agent = new ShoppingAgent({ llm, verbose: true });

  // Use runStream() for real-time output
  console.log('--- Streaming Output ---\n');

  let lastType = '';
  for await (const event of agent.runStream(
    `Research desk accessories at ${merchant.domain}. Browse the catalog, get details on desk-related products, and produce a comparison report.`,
  )) {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.text);
        lastType = 'text';
        break;

      case 'tool_call':
        if (lastType === 'text') console.log('');
        console.log(`\n  >> Calling: ${event.toolName}(${JSON.stringify(event.toolInput)})`);
        lastType = 'tool';
        break;

      case 'tool_result': {
        const preview = typeof event.toolOutput === 'string'
          ? event.toolOutput.slice(0, 80)
          : JSON.stringify(event.toolOutput).slice(0, 80);
        console.log(`  << Result: ${preview}...`);
        lastType = 'tool';
        break;
      }

      case 'done':
        if (lastType === 'text') console.log('');
        console.log('\n--- Research Complete ---');
        console.log(`Iterations: ${event.result.iterations}`);
        console.log(`Success: ${event.result.success}`);
        break;

      case 'error':
        console.error(`\nError: ${event.error}`);
        break;
    }
  }

  await merchant.stop();
}

main().catch(console.error);
