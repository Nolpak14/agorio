/**
 * Agorio v0.7 Procurement Reference Agent
 *
 * The headline B2B demo: an agent that comparison-shops three merchants,
 * requires human approval above a threshold, attaches a PO# to the cart,
 * categorizes the expense, completes checkout, and streams the entire
 * audit trail to Agorio Cloud.
 *
 * Composed via AgentChain:
 *   1) find-best-price  → comparison-shops across merchants
 *   2) request-approval → assigns PO#, routes to approval-workflow plugin
 *   3) checkout-and-track → submits payment, subscribes to order updates
 *
 * Run: npx tsx examples/procurement/index.ts
 *
 * Set AGORIO_API_KEY to ship traces to cloud.agorio.dev/traces (optional).
 */

import {
  AgentChain,
  ShoppingAgent,
  MockMerchant,
  agorioCloud,
} from '../../src/index.js';
import type {
  ChatMessage,
  LlmAdapter,
  LlmResponse,
  SubAgent,
  ToolCall,
  ToolDefinition,
} from '../../src/index.js';
import { createApprovalWorkflowPlugin } from '../../plugins/approval-workflow/src/index.js';
import { createSpendingControlsPlugin } from '../../plugins/spending-controls/src/index.js';
import { createAuditTrailPlugin } from '../../plugins/audit-trail/src/index.js';
import { createAgentIdentityPlugin } from '../../plugins/agent-identity/src/index.js';
import { createProcurementPlugin } from '../../plugins/procurement/src/index.js';

// ─── Scripted LLM (so the demo is deterministic without a paid model) ───

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-procurement';
  private callIndex = 0;
  constructor(private readonly script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {}
  async chat(_msgs: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex++];
    if (!step) return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
    };
  }
}

// ─── Main ───

async function main() {
  console.log('=== Agorio Procurement Reference Agent ===\n');

  // 1) Spin up three MockMerchants — in production these would be Shopify,
  //    WooCommerce, and a UCP-native B2B catalog. See README for the full setup.
  const m1 = [
    new MockMerchant({ name: 'Acme Office Supplies' }),
    new MockMerchant({ name: 'WidgetCorp' }),
    new MockMerchant({ name: 'ChairWorks B2B' }),
  ];
  await Promise.all(m1.map((m) => m.start()));

  console.log(`Merchant 1: ${m1[0].domain} (Acme Office Supplies)`);
  console.log(`Merchant 2: ${m1[1].domain} (WidgetCorp)`);
  console.log(`Merchant 3: ${m1[2].domain} (ChairWorks B2B)\n`);

  // 2) Plugins shared across all sub-agents
  const sharedPlugins = () => [
    createAgentIdentityPlugin({
      agentId: 'acme-procurement-agent',
      organizationId: 'acme-corp',
      organizationName: 'Acme Corp',
      department: 'Procurement',
      contactEmail: 'cfo@acme.example',
      permissions: ['compare_prices', 'submit_payment', 'assign_po_number'],
    }),
    createSpendingControlsPlugin({
      perTransactionLimit: 5_000,
      dailyLimit: 25_000,
      currency: 'USD',
    }),
    createApprovalWorkflowPlugin({
      requireApprovalAbove: 1_000,
      currency: 'USD',
      onApprovalRequired: (req) => {
        console.log(`\n[Approval] ${req.currency} ${req.amount.toFixed(2)} requires review (request ${req.requestId})`);
      },
    }),
    createAuditTrailPlugin({
      output: 'console',
      includeArgs: false,
      includeResults: false,
    }),
    createProcurementPlugin({
      vendors: [
        { id: 'acme', name: 'Acme Office Supplies', domain: m1[0].domain, paymentTerms: 'NET-30', taxCategory: 'office', preferred: true },
        { id: 'widget', name: 'WidgetCorp', domain: m1[1].domain, paymentTerms: 'NET-15', taxCategory: 'general' },
        { id: 'chairworks', name: 'ChairWorks B2B', domain: m1[2].domain, paymentTerms: 'NET-30', taxCategory: 'furniture', preferred: true },
      ],
      expenseCategories: ['office-supplies', 'it-equipment', 'furniture'],
      poNumberPrefix: 'PO-2026',
      poNumberStrategy: 'sequential',
      requirePoOnCheckout: true,
      onProcurementCompleted: (e) => {
        console.log(`\n[Procurement] Order placed: PO ${e.poNumber}, vendor=${e.vendorId}, category=${e.category}, total=${e.currency} ${e.amount.toFixed(2)}`);
      },
    }),
  ];

  // 3) Optional Cloud telemetry — surfaces the entire run at cloud.agorio.dev/traces
  const cloud = process.env.AGORIO_API_KEY
    ? agorioCloud({ apiKey: process.env.AGORIO_API_KEY })
    : null;

  // 4) Define the three sub-agents
  const findBestPrice: SubAgent = {
    name: 'find-best-price',
    description: 'Comparison-shops the configured merchants and returns the lowest-total option.',
    build: (ctx) => new ShoppingAgent({
      llm: new ScriptedLlm([
        {
          toolCalls: [{ id: '1', name: 'discover_merchant', arguments: { domain: m1[0].domain } }],
        },
        {
          toolCalls: [{ id: '2', name: 'discover_merchant', arguments: { domain: m1[1].domain } }],
        },
        {
          toolCalls: [{ id: '3', name: 'discover_merchant', arguments: { domain: m1[2].domain } }],
        },
        {
          toolCalls: [{ id: '4', name: 'compare_prices', arguments: { query: 'ergonomic office chair' } }],
        },
        { content: `Best price found on ${m1[2].domain} — ChairWorks B2B has the lowest total.` },
      ]),
      tracer: ctx.tracer,
      onLog: ctx.onLog,
      plugins: sharedPlugins(),
    }),
  };

  const requestApproval: SubAgent = {
    name: 'request-approval',
    description: 'Assigns a PO# and routes high-value carts through the approval-workflow plugin.',
    build: (ctx) => new ShoppingAgent({
      llm: new ScriptedLlm([
        {
          toolCalls: [{ id: '1', name: 'discover_merchant', arguments: { domain: m1[2].domain } }],
        },
        {
          toolCalls: [{ id: '2', name: 'search_products', arguments: { query: 'ergonomic chair' } }],
        },
        {
          // Add to cart (the MockMerchant's first product)
          toolCalls: [{ id: '3', name: 'add_to_cart', arguments: { productId: '1', quantity: 10 } }],
        },
        {
          toolCalls: [{ id: '4', name: 'procurement', arguments: { action: 'assign_po_number' } }],
        },
        {
          toolCalls: [{ id: '5', name: 'procurement', arguments: { action: 'categorize_expense', category: 'furniture' } }],
        },
        { content: 'PO# assigned, expense categorized. Cart is ready for checkout.' },
      ]),
      tracer: ctx.tracer,
      onLog: ctx.onLog,
      plugins: sharedPlugins(),
    }),
  };

  const checkoutAndTrack: SubAgent = {
    name: 'checkout-and-track',
    description: 'Submits payment with the assigned PO# and subscribes to shipment updates.',
    build: (ctx) => new ShoppingAgent({
      llm: new ScriptedLlm([
        {
          toolCalls: [{ id: '1', name: 'discover_merchant', arguments: { domain: m1[2].domain } }],
        },
        { content: 'Checkout-and-track simulation complete (full payment flow requires real merchant credentials).' },
      ]),
      tracer: ctx.tracer,
      onLog: ctx.onLog,
      plugins: sharedPlugins(),
    }),
  };

  // 5) Compose into a chain
  const chain = new AgentChain()
    .add(findBestPrice)
    .add(requestApproval, (chainCtx, initialInput) =>
      `${initialInput}. Lowest price found: ${chainCtx.results[0].output.answer}`
    )
    .add(checkoutAndTrack);

  // 6) Run!
  const result = await chain.run(
    'Order 10 ergonomic chairs for the new procurement team. Best price wins; PO# required.',
    {
      tracer: cloud?.tracer,
      onLog: cloud?.onLog,
    }
  );

  console.log('\n=== Chain complete ===');
  console.log('Success:', result.success);
  console.log('Final answer:', result.answer);
  console.log('Total LLM calls:', result.usage?.llmCalls);
  console.log('Total tool calls:', result.usage?.toolCalls);
  console.log('Total tokens:', result.usage?.totalTokens);

  if (cloud) {
    await cloud.shutdown();
    console.log('\n→ Trace visible at https://cloud.agorio.dev/traces');
  }

  await Promise.all(m1.map((m) => m.stop()));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
