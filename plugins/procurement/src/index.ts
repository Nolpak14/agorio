import { randomUUID } from 'node:crypto';
import type { EnterprisePlugin, PluginContext, PluginManifest } from '@agorio/sdk';

export const PLUGIN_MANIFEST: PluginManifest = {
  version: '0.1.0',
  author: 'Agorio',
  category: 'governance',
  tier: 'pro',
};

export interface VendorConfig {
  id: string;
  name: string;
  domain: string;
  paymentTerms?: string;
  taxCategory?: string;
  preferred?: boolean;
  metadata?: Record<string, unknown>;
}

export type PoNumberStrategy = 'sequential' | 'uuid' | (() => string);

export interface ProcurementConfig {
  vendors?: VendorConfig[];
  expenseCategories?: string[];
  poNumberPrefix?: string;
  poNumberStrategy?: PoNumberStrategy;
  requirePoOnCheckout?: boolean;
  onProcurementCompleted?: (event: ProcurementCompletedEvent) => void;
}

export interface ProcurementCompletedEvent {
  poNumber: string;
  vendorId: string | null;
  category: string | null;
  amount: number;
  currency: string;
  merchant: string | null;
  timestamp: number;
}

interface CartTag {
  poNumber: string | null;
  vendorId: string | null;
  category: string | null;
}

export function createProcurementPlugin(config: ProcurementConfig = {}): EnterprisePlugin {
  const vendorsByDomain = new Map<string, VendorConfig>();
  for (const v of config.vendors ?? []) {
    vendorsByDomain.set(normalizeDomain(v.domain), v);
  }

  const expenseCategorySet = new Set(config.expenseCategories ?? []);
  const prefix = config.poNumberPrefix ?? 'PO';
  const strategy: PoNumberStrategy = config.poNumberStrategy ?? 'sequential';
  let sequentialCounter = 0;

  /** Cart tags keyed by `<merchant_domain>` (one in-flight tag per merchant). */
  const cartTags = new Map<string, CartTag>();

  let pluginCtx: PluginContext | undefined;

  function getOrCreateTag(merchant: string | null): CartTag {
    const key = merchant ?? '__none__';
    let tag = cartTags.get(key);
    if (!tag) {
      tag = { poNumber: null, vendorId: null, category: null };
      cartTags.set(key, tag);
    }
    return tag;
  }

  function generatePoNumber(): string {
    if (typeof strategy === 'function') return strategy();
    if (strategy === 'uuid') return `${prefix}-${randomUUID()}`;
    sequentialCounter++;
    return `${prefix}-${String(sequentialCounter).padStart(6, '0')}`;
  }

  return {
    name: 'procurement',
    description:
      'Procurement tooling — assign purchase-order numbers, look up vendor info, and categorize the active cart\'s expense. Use `assign_po_number` before checkout if PO numbers are required.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['assign_po_number', 'lookup_vendor', 'categorize_expense'],
          description: 'Procurement action to perform.',
        },
        domain: {
          type: 'string',
          description: 'Merchant domain (for `lookup_vendor`).',
        },
        category: {
          type: 'string',
          description: 'Expense category (for `categorize_expense`). Must be one of the configured categories.',
        },
      },
      required: ['action'],
    },
    manifest: PLUGIN_MANIFEST,

    handler(args) {
      const action = String(args.action);
      switch (action) {
        case 'assign_po_number': {
          const merchant = pluginCtx?.getActiveMerchant() ?? null;
          const tag = getOrCreateTag(merchant);
          tag.poNumber = generatePoNumber();
          if (merchant) {
            const vendor = vendorsByDomain.get(normalizeDomain(merchant));
            if (vendor) tag.vendorId = vendor.id;
          }
          return { poNumber: tag.poNumber, vendorId: tag.vendorId };
        }

        case 'lookup_vendor': {
          const domain = String(args.domain ?? pluginCtx?.getActiveMerchant() ?? '');
          if (!domain) return { error: 'lookup_vendor: `domain` is required (no active merchant either)' };
          const vendor = vendorsByDomain.get(normalizeDomain(domain));
          if (!vendor) return { error: `Unknown vendor for domain: ${domain}` };
          return { vendor };
        }

        case 'categorize_expense': {
          const category = String(args.category ?? '');
          if (!category) return { error: 'categorize_expense: `category` is required' };
          if (expenseCategorySet.size > 0 && !expenseCategorySet.has(category)) {
            return {
              error: `Unknown expense category "${category}". Allowed: ${[...expenseCategorySet].join(', ')}`,
            };
          }
          const merchant = pluginCtx?.getActiveMerchant() ?? null;
          const tag = getOrCreateTag(merchant);
          tag.category = category;
          return { assigned: true, category };
        }

        default:
          return { error: `Unknown procurement action: ${action}` };
      }
    },

    onInit(context) {
      pluginCtx = context;
    },

    onBeforeToolCall(toolName, _args, context) {
      if (toolName !== 'submit_payment') return { allow: true };
      if (!config.requirePoOnCheckout) return { allow: true };

      const merchant = context.getActiveMerchant();
      const tag = cartTags.get(merchant ?? '__none__');
      if (!tag || !tag.poNumber) {
        return {
          allow: false,
          reason:
            'PO# required for this transaction. Call the `procurement` tool with action `assign_po_number` first.',
        };
      }
      return { allow: true };
    },

    onAfterToolCall(toolName, _args, result, context) {
      if (toolName !== 'submit_payment') return;
      if (!result || typeof result !== 'object' || !('orderId' in result)) return;

      const merchant = context.getActiveMerchant();
      const tag = cartTags.get(merchant ?? '__none__');
      const cart = context.getCart();
      const amount = parseFloat(cart.subtotal.amount);

      const event: ProcurementCompletedEvent = {
        poNumber: tag?.poNumber ?? '',
        vendorId: tag?.vendorId ?? null,
        category: tag?.category ?? null,
        amount,
        currency: cart.subtotal.currency,
        merchant,
        timestamp: Date.now(),
      };
      config.onProcurementCompleted?.(event);

      // Reset the tag after a successful checkout so the next purchase on the
      // same merchant starts fresh.
      cartTags.delete(merchant ?? '__none__');
    },

    getState() {
      return {
        cartTags: Array.from(cartTags.entries()).map(([merchant, tag]) => ({
          merchant,
          ...tag,
        })),
        sequentialCounter,
      };
    },

    hydrate(state) {
      cartTags.clear();
      const tags = Array.isArray(state.cartTags) ? state.cartTags : [];
      for (const entry of tags as Array<{ merchant: string } & CartTag>) {
        const { merchant, ...rest } = entry;
        cartTags.set(merchant, rest);
      }
      if (typeof state.sequentialCounter === 'number') {
        sequentialCounter = state.sequentialCounter;
      }
    },
  };
}

function normalizeDomain(d: string): string {
  return d.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
}
