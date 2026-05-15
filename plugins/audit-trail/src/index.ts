import type { EnterprisePlugin, PluginContext, PluginManifest } from '@agorio/sdk';

export const PLUGIN_MANIFEST: PluginManifest = {
  version: '1.0.0',
  author: 'Agorio',
  category: 'governance',
  tier: 'pro',
};


export interface AuditTrailConfig {
  output?: 'console' | 'webhook' | 'callback';
  webhookUrl?: string;
  callback?: (entry: AuditEntry) => void;
  includeArgs?: boolean;
  includeResults?: boolean;
  redactFields?: string[];
  batchSize?: number;
}

export interface AuditEntry {
  sessionId: string;
  timestamp: number;
  toolName: string;
  type: 'invocation' | 'result';
  args?: Record<string, unknown>;
  result?: unknown;
  latencyMs?: number;
  merchant: string | null;
  iteration: number;
}

function redact(
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const redacted = { ...obj };
  for (const field of fields) {
    if (field in redacted) {
      redacted[field] = '[REDACTED]';
    }
  }
  return redacted;
}

export function createAuditTrailPlugin(
  config: AuditTrailConfig = {}
): EnterprisePlugin {
  const log: AuditEntry[] = [];
  const buffer: AuditEntry[] = [];
  const sessionId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const includeArgs = config.includeArgs ?? true;
  const includeResults = config.includeResults ?? false;
  const redactFields = config.redactFields ?? [];
  const batchSize = config.batchSize ?? 10;
  const output = config.output ?? 'console';
  const pendingInvocations = new Map<string, number>();

  function emit(entry: AuditEntry) {
    log.push(entry);

    if (output === 'console') {
      const prefix = entry.type === 'invocation' ? '→' : '←';
      const latency = entry.latencyMs != null ? ` (${entry.latencyMs}ms)` : '';
      console.log(`[audit] ${prefix} ${entry.toolName}${latency}`);
    }

    if (output === 'callback' && config.callback) {
      config.callback(entry);
    }

    if (output === 'webhook' && config.webhookUrl) {
      buffer.push(entry);
      if (buffer.length >= batchSize) {
        const batch = buffer.splice(0, buffer.length);
        fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, entries: batch }),
        }).catch(() => {});
      }
    }
  }

  return {
    name: 'audit_trail',
    description: 'Retrieve the audit log for this agent session',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return (default: all)',
        },
        toolFilter: {
          type: 'string',
          description: 'Filter entries by tool name',
        },
      },
    },
    manifest: {
      version: '1.0.0',
      author: 'Agorio',
      category: 'governance',
      tier: 'pro',
    },

    handler(args) {
      let entries = [...log];
      if (args.toolFilter) {
        entries = entries.filter(e => e.toolName === args.toolFilter);
      }
      if (args.limit) {
        entries = entries.slice(-Number(args.limit));
      }
      return {
        sessionId,
        totalEntries: log.length,
        entries,
      };
    },

    onBeforeToolCall(toolName, args, context) {
      const entry: AuditEntry = {
        sessionId,
        timestamp: Date.now(),
        toolName,
        type: 'invocation',
        merchant: context.getActiveMerchant(),
        iteration: context.getCurrentIteration(),
      };

      if (includeArgs) {
        entry.args = redactFields.length > 0
          ? redact(args, redactFields)
          : { ...args };
      }

      pendingInvocations.set(toolName, Date.now());
      emit(entry);

      return { allow: true };
    },

    async onAfterToolCall(toolName, _args, result, context) {
      const startTime = pendingInvocations.get(toolName);
      pendingInvocations.delete(toolName);

      const entry: AuditEntry = {
        sessionId,
        timestamp: Date.now(),
        toolName,
        type: 'result',
        latencyMs: startTime != null ? Date.now() - startTime : undefined,
        merchant: context.getActiveMerchant(),
        iteration: context.getCurrentIteration(),
      };

      if (includeResults) {
        entry.result = result;
      }

      emit(entry);
    },

    getState() {
      return {
        sessionId,
        totalEntries: log.length,
        log: [...log],
      };
    },
  };
}
