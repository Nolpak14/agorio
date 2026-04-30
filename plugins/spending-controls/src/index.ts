import type { EnterprisePlugin, PluginContext, PluginManifest } from '@agorio/sdk';

export const PLUGIN_MANIFEST: PluginManifest = {
  version: '1.0.0',
  author: 'Agorio',
  category: 'governance',
  tier: 'pro',
};

const LICENSE_KEY = process.env.AGORIO_LICENSE_KEY;
if (!LICENSE_KEY || !/^agorio_(pro|ent)_[a-zA-Z0-9]{32,}$/.test(LICENSE_KEY)) {
  console.warn(
    '[@agorio/plugin-spending-controls] AGORIO_LICENSE_KEY not set or invalid. ' +
    'Get your key at https://agorio.dev/pricing'
  );
}

export interface SpendingControlsConfig {
  perTransactionLimit: number;
  dailyLimit?: number;
  sessionLimit?: number;
  currency?: string;
  onLimitExceeded?: (details: SpendingLimitExceeded) => void;
}

export interface SpendingLimitExceeded {
  type: 'per_transaction' | 'daily' | 'session';
  attempted: number;
  limit: number;
  current: number;
  currency: string;
}

interface TransactionRecord {
  amount: number;
  timestamp: number;
  merchant: string | null;
}

function getDailySpent(history: TransactionRecord[]): number {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return history
    .filter(r => r.timestamp >= oneDayAgo)
    .reduce((sum, r) => sum + r.amount, 0);
}

export function createSpendingControlsPlugin(
  config: SpendingControlsConfig
): EnterprisePlugin {
  let totalSpent = 0;
  const history: TransactionRecord[] = [];
  let ctx: PluginContext;
  const currency = config.currency ?? 'USD';

  return {
    name: 'spending_controls',
    description: 'Check remaining spending budget and enforce limits',
    parameters: {
      type: 'object',
      properties: {},
    },
    manifest: {
      version: '1.0.0',
      author: 'Agorio',
      category: 'governance',
      tier: 'pro',
    },

    handler() {
      const dailySpent = getDailySpent(history);
      return {
        remaining: {
          perTransaction: config.perTransactionLimit,
          daily: config.dailyLimit != null ? config.dailyLimit - dailySpent : null,
          session: config.sessionLimit != null ? config.sessionLimit - totalSpent : null,
        },
        totalSpent,
        transactionCount: history.length,
        currency,
      };
    },

    onInit(context) {
      ctx = context;
    },

    onBeforeToolCall(toolName, _args, context) {
      if (toolName !== 'submit_payment') {
        return { allow: true };
      }

      const cart = context.getCart();
      const amount = parseFloat(cart.subtotal.amount);

      if (amount > config.perTransactionLimit) {
        const details: SpendingLimitExceeded = {
          type: 'per_transaction',
          attempted: amount,
          limit: config.perTransactionLimit,
          current: 0,
          currency,
        };
        config.onLimitExceeded?.(details);
        return {
          allow: false,
          reason: `Transaction ${currency} ${amount.toFixed(2)} exceeds per-transaction limit of ${currency} ${config.perTransactionLimit.toFixed(2)}`,
        };
      }

      if (config.sessionLimit != null && totalSpent + amount > config.sessionLimit) {
        const details: SpendingLimitExceeded = {
          type: 'session',
          attempted: amount,
          limit: config.sessionLimit,
          current: totalSpent,
          currency,
        };
        config.onLimitExceeded?.(details);
        return {
          allow: false,
          reason: `Would exceed session spending limit of ${currency} ${config.sessionLimit.toFixed(2)} (spent: ${currency} ${totalSpent.toFixed(2)})`,
        };
      }

      if (config.dailyLimit != null) {
        const dailySpent = getDailySpent(history);
        if (dailySpent + amount > config.dailyLimit) {
          const details: SpendingLimitExceeded = {
            type: 'daily',
            attempted: amount,
            limit: config.dailyLimit,
            current: dailySpent,
            currency,
          };
          config.onLimitExceeded?.(details);
          return {
            allow: false,
            reason: `Would exceed daily spending limit of ${currency} ${config.dailyLimit.toFixed(2)} (spent today: ${currency} ${dailySpent.toFixed(2)})`,
          };
        }
      }

      return { allow: true };
    },

    async onAfterToolCall(toolName, _args, result, context) {
      if (toolName === 'submit_payment' && result && typeof result === 'object' && 'orderId' in result) {
        const cart = context.getCart();
        const amount = parseFloat(cart.subtotal.amount);
        totalSpent += amount;
        history.push({
          amount,
          timestamp: Date.now(),
          merchant: context.getActiveMerchant(),
        });
      }
    },

    getState() {
      return {
        totalSpent,
        transactionCount: history.length,
        dailySpent: getDailySpent(history),
        currency,
        history: [...history],
      };
    },
  };
}
