import type { EnterprisePlugin, PluginContext, PluginManifest } from '@agorio/sdk';

export const PLUGIN_MANIFEST: PluginManifest = {
  version: '1.0.0',
  author: 'Agorio',
  category: 'governance',
  tier: 'pro',
};


export interface ApprovalWorkflowConfig {
  requireApprovalAbove: number;
  webhookUrl?: string;
  timeoutMs?: number;
  autoApproveBelow?: number;
  currency?: string;
  onApprovalRequired?: (request: ApprovalRequest) => void;
}

export interface ApprovalRequest {
  requestId: string;
  amount: number;
  currency: string;
  merchant: string | null;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied' | 'timeout';
}

let requestCounter = 0;
function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

export function createApprovalWorkflowPlugin(
  config: ApprovalWorkflowConfig
): EnterprisePlugin {
  const pendingApprovals = new Map<string, ApprovalRequest>();
  const resolvedApprovals = new Map<string, ApprovalRequest>();
  let ctx: PluginContext;
  const currency = config.currency ?? 'USD';

  return {
    name: 'approval_workflow',
    description: 'Check approval status or submit an approval decision for a pending transaction',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['check_status', 'approve', 'deny'],
          description: 'Action to perform',
        },
        requestId: {
          type: 'string',
          description: 'Approval request ID (required for approve/deny)',
        },
      },
      required: ['action'],
    },
    manifest: {
      version: '1.0.0',
      author: 'Agorio',
      category: 'governance',
      tier: 'pro',
    },

    handler(args) {
      const action = args.action as string;

      if (action === 'check_status') {
        const pending = [...pendingApprovals.values()];
        const resolved = [...resolvedApprovals.values()];
        return { pending, resolved };
      }

      const requestId = args.requestId as string;
      const request = pendingApprovals.get(requestId);
      if (!request) {
        return { error: `No pending approval with ID: ${requestId}` };
      }

      if (action === 'approve') {
        request.status = 'approved';
        pendingApprovals.delete(requestId);
        resolvedApprovals.set(requestId, request);
        return { approved: true, requestId };
      }

      if (action === 'deny') {
        request.status = 'denied';
        pendingApprovals.delete(requestId);
        resolvedApprovals.set(requestId, request);
        return { denied: true, requestId };
      }

      return { error: `Unknown action: ${action}` };
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

      if (config.autoApproveBelow != null && amount <= config.autoApproveBelow) {
        return { allow: true };
      }

      if (amount <= config.requireApprovalAbove) {
        return { allow: true };
      }

      // Check if there's an approved request for this session
      for (const [, req] of resolvedApprovals) {
        if (req.status === 'approved' && req.merchant === context.getActiveMerchant()) {
          return { allow: true };
        }
      }

      const requestId = generateRequestId();
      const request: ApprovalRequest = {
        requestId,
        amount,
        currency,
        merchant: context.getActiveMerchant(),
        timestamp: Date.now(),
        status: 'pending',
      };

      pendingApprovals.set(requestId, request);
      config.onApprovalRequired?.(request);

      if (config.webhookUrl) {
        fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }).catch(() => {});
      }

      return {
        allow: false,
        reason: `Transaction of ${currency} ${amount.toFixed(2)} requires approval. Request ID: ${requestId}. Use the approval_workflow tool with action "approve" or "deny" to proceed.`,
      };
    },

    getState() {
      return {
        pending: [...pendingApprovals.values()],
        resolved: [...resolvedApprovals.values()],
      };
    },

    hydrate(state) {
      pendingApprovals.clear();
      resolvedApprovals.clear();
      const pending = Array.isArray(state.pending) ? (state.pending as ApprovalRequest[]) : [];
      const resolved = Array.isArray(state.resolved) ? (state.resolved as ApprovalRequest[]) : [];
      for (const req of pending) pendingApprovals.set(req.requestId, req);
      for (const req of resolved) resolvedApprovals.set(req.requestId, req);
    },
  };
}
