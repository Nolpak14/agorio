/**
 * Tests for createProcurementPlugin.
 */

import { describe, it, expect, vi } from 'vitest';
import { createProcurementPlugin } from '../src/index.js';
import type { PluginContext, CartState } from '@agorio/sdk';

function makeCtx(overrides: Partial<{
  cart: CartState;
  activeMerchant: string | null;
}> = {}): PluginContext {
  const cart: CartState = overrides.cart ?? {
    items: [],
    subtotal: { amount: '500.00', currency: 'USD' },
    itemCount: 0,
  };
  return {
    getCart: () => cart,
    getActiveMerchant: () => overrides.activeMerchant ?? null,
    getCheckoutSessionId: () => null,
    getMerchants: () => [],
    getSteps: () => [],
    getCurrentIteration: () => 1,
  };
}

describe('createProcurementPlugin', () => {
  it('assigns a sequential PO number with the configured prefix', () => {
    const plugin = createProcurementPlugin({ poNumberPrefix: 'PO-2026' });
    plugin.onInit?.(makeCtx({ activeMerchant: 'acme.com' }));

    const r1 = plugin.handler({ action: 'assign_po_number' }) as { poNumber: string };
    const r2 = plugin.handler({ action: 'assign_po_number' }) as { poNumber: string };
    expect(r1.poNumber).toBe('PO-2026-000001');
    expect(r2.poNumber).toBe('PO-2026-000002');
  });

  it('assigns a UUID-style PO number when strategy is "uuid"', () => {
    const plugin = createProcurementPlugin({ poNumberStrategy: 'uuid', poNumberPrefix: 'X' });
    plugin.onInit?.(makeCtx());
    const r = plugin.handler({ action: 'assign_po_number' }) as { poNumber: string };
    expect(r.poNumber).toMatch(/^X-[0-9a-f-]{36}$/i);
  });

  it('supports a custom PO number strategy function', () => {
    const strategy = vi.fn(() => 'CUSTOM-42');
    const plugin = createProcurementPlugin({ poNumberStrategy: strategy });
    plugin.onInit?.(makeCtx());
    expect((plugin.handler({ action: 'assign_po_number' }) as { poNumber: string }).poNumber).toBe('CUSTOM-42');
    expect(strategy).toHaveBeenCalledOnce();
  });

  it('associates the PO with the active merchant\'s vendor on assignment', () => {
    const plugin = createProcurementPlugin({
      vendors: [{ id: 'acme', name: 'Acme', domain: 'acme.com' }],
    });
    plugin.onInit?.(makeCtx({ activeMerchant: 'https://acme.com/' }));
    const r = plugin.handler({ action: 'assign_po_number' }) as { vendorId: string };
    expect(r.vendorId).toBe('acme');
  });

  it('looks up a vendor by domain', () => {
    const plugin = createProcurementPlugin({
      vendors: [
        { id: 'acme', name: 'Acme', domain: 'acme.com', paymentTerms: 'NET-30' },
      ],
    });
    plugin.onInit?.(makeCtx());
    const r = plugin.handler({ action: 'lookup_vendor', domain: 'acme.com' });
    expect(r).toEqual({ vendor: { id: 'acme', name: 'Acme', domain: 'acme.com', paymentTerms: 'NET-30' } });
  });

  it('returns an error for an unknown vendor domain', () => {
    const plugin = createProcurementPlugin({ vendors: [] });
    plugin.onInit?.(makeCtx());
    const r = plugin.handler({ action: 'lookup_vendor', domain: 'unknown.com' });
    expect(r).toMatchObject({ error: expect.stringMatching(/Unknown vendor/) });
  });

  it('rejects an expense category not in the configured set', () => {
    const plugin = createProcurementPlugin({ expenseCategories: ['office', 'it'] });
    plugin.onInit?.(makeCtx());
    const ok = plugin.handler({ action: 'categorize_expense', category: 'office' });
    expect(ok).toEqual({ assigned: true, category: 'office' });
    const bad = plugin.handler({ action: 'categorize_expense', category: 'travel' });
    expect(bad).toMatchObject({ error: expect.stringMatching(/Unknown expense category/) });
  });

  it('blocks submit_payment when requirePoOnCheckout and no PO# is set', async () => {
    const plugin = createProcurementPlugin({ requirePoOnCheckout: true });
    const ctx = makeCtx({ activeMerchant: 'acme.com' });
    plugin.onInit?.(ctx);

    const decision = await plugin.onBeforeToolCall!('submit_payment', {}, ctx);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/PO# required/);
  });

  it('allows submit_payment after assign_po_number has been called', async () => {
    const plugin = createProcurementPlugin({ requirePoOnCheckout: true });
    const ctx = makeCtx({ activeMerchant: 'acme.com' });
    plugin.onInit?.(ctx);
    plugin.handler({ action: 'assign_po_number' });

    const decision = await plugin.onBeforeToolCall!('submit_payment', {}, ctx);
    expect(decision.allow).toBe(true);
  });

  it('does not block submit_payment when requirePoOnCheckout is false', async () => {
    const plugin = createProcurementPlugin({ requirePoOnCheckout: false });
    const ctx = makeCtx({ activeMerchant: 'acme.com' });
    plugin.onInit?.(ctx);
    const decision = await plugin.onBeforeToolCall!('submit_payment', {}, ctx);
    expect(decision.allow).toBe(true);
  });

  it('fires onProcurementCompleted with PO# + vendor + category on successful checkout', async () => {
    const events: unknown[] = [];
    const plugin = createProcurementPlugin({
      vendors: [{ id: 'acme', name: 'Acme', domain: 'acme.com' }],
      expenseCategories: ['office'],
      onProcurementCompleted: (e) => events.push(e),
    });
    const ctx = makeCtx({ activeMerchant: 'acme.com' });
    plugin.onInit?.(ctx);

    plugin.handler({ action: 'assign_po_number' });
    plugin.handler({ action: 'categorize_expense', category: 'office' });

    await plugin.onAfterToolCall!('submit_payment', {}, { orderId: 'ord_123' }, ctx);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      poNumber: expect.stringMatching(/^PO-/),
      vendorId: 'acme',
      category: 'office',
      amount: 500,
      currency: 'USD',
      merchant: 'acme.com',
    });
  });

  it('persists and rehydrates cart tags via getState / hydrate', () => {
    const a = createProcurementPlugin({ poNumberPrefix: 'PO' });
    a.onInit?.(makeCtx({ activeMerchant: 'acme.com' }));
    a.handler({ action: 'assign_po_number' });
    a.handler({ action: 'categorize_expense', category: 'office' });

    const snap = a.getState!();

    const b = createProcurementPlugin({ poNumberPrefix: 'PO', expenseCategories: ['office'] });
    b.onInit?.(makeCtx({ activeMerchant: 'acme.com' }));
    b.hydrate!(snap);

    // After hydrate, submit_payment shouldn't be blocked because the PO# survives
    const ctx2 = makeCtx({ activeMerchant: 'acme.com' });
    const decision = (b.onBeforeToolCall as NonNullable<typeof b.onBeforeToolCall>)('submit_payment', {}, ctx2);
    if (decision instanceof Promise) throw new Error('expected sync decision');
    expect(decision.allow).toBe(true);
  });
});
