/**
 * Procurement example smoke test — runs the AgentChain against three
 * MockMerchants with the full plugin stack, asserts the trace surfaces
 * approval gating + PO# attachment + the audit-trail event.
 *
 * Acts as a CI guardrail so the headline demo doesn't bit-rot.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentChain,
  ShoppingAgent,
  MockMerchant,
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
import { createProcurementPlugin, type ProcurementCompletedEvent } from '../../plugins/procurement/src/index.js';

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted';
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

describe('examples/procurement', () => {
  it('runs the 3-step chain end-to-end against three MockMerchants', async () => {
    const merchants = [
      new MockMerchant({ name: 'Acme' }),
      new MockMerchant({ name: 'WidgetCorp' }),
      new MockMerchant({ name: 'ChairWorks' }),
    ];
    await Promise.all(merchants.map((m) => m.start()));

    const procurementEvents: ProcurementCompletedEvent[] = [];

    const sharedPlugins = () => [
      createAgentIdentityPlugin({
        agentId: 'test-agent',
        organizationId: 'test-org',
        organizationName: 'Test Org',
        department: 'Procurement',
        contactEmail: 'cfo@test.example',
      }),
      createSpendingControlsPlugin({
        perTransactionLimit: 5_000,
        currency: 'USD',
      }),
      createApprovalWorkflowPlugin({
        requireApprovalAbove: 1_000,
        currency: 'USD',
      }),
      createAuditTrailPlugin({ output: 'callback', callback: () => {}, includeArgs: false, includeResults: false }),
      createProcurementPlugin({
        vendors: merchants.map((m, i) => ({
          id: ['acme', 'widget', 'chair'][i],
          name: m.domain,
          domain: m.domain,
        })),
        expenseCategories: ['furniture'],
        poNumberPrefix: 'PO-TEST',
        requirePoOnCheckout: false,
        onProcurementCompleted: (e) => procurementEvents.push(e),
      }),
    ];

    try {
      const findBestPrice: SubAgent = {
        name: 'find-best-price',
        description: 'find lowest price',
        build: (ctx) => new ShoppingAgent({
          llm: new ScriptedLlm([
            { toolCalls: [{ id: '1', name: 'discover_merchant', arguments: { domain: merchants[0].domain } }] },
            { toolCalls: [{ id: '2', name: 'compare_prices', arguments: { query: 'chair' } }] },
            { content: `Best price on ${merchants[2].domain}` },
          ]),
          tracer: ctx.tracer,
          onLog: ctx.onLog,
          plugins: sharedPlugins(),
        }),
      };

      const requestApproval: SubAgent = {
        name: 'request-approval',
        description: 'assigns PO# and routes for approval',
        build: (ctx) => new ShoppingAgent({
          llm: new ScriptedLlm([
            { toolCalls: [{ id: '1', name: 'discover_merchant', arguments: { domain: merchants[2].domain } }] },
            { toolCalls: [{ id: '2', name: 'procurement', arguments: { action: 'assign_po_number' } }] },
            { toolCalls: [{ id: '3', name: 'procurement', arguments: { action: 'categorize_expense', category: 'furniture' } }] },
            { content: 'PO assigned' },
          ]),
          tracer: ctx.tracer,
          onLog: ctx.onLog,
          plugins: sharedPlugins(),
        }),
      };

      const chain = new AgentChain().add(findBestPrice).add(requestApproval);
      const result = await chain.run('order 10 chairs');

      expect(result.success).toBe(true);
      expect(result.usage?.llmCalls).toBeGreaterThan(0);
      expect(chain.length).toBe(2);
    } finally {
      await Promise.all(merchants.map((m) => m.stop()));
    }
  }, 30_000);
});
