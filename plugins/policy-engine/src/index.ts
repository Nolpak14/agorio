import type { EnterprisePlugin, PluginContext, PluginToolDecision, PluginManifest } from '@agorio/sdk';

export const PLUGIN_MANIFEST: PluginManifest = {
  version: '1.0.0',
  author: 'Agorio',
  category: 'governance',
  tier: 'enterprise',
};


export interface PolicyRule {
  id: string;
  tool: string | string[];
  action: 'block' | 'modify';
  description?: string;
  enabled?: boolean;
}

export interface AllowlistPolicy extends PolicyRule {
  type: 'allowlist';
  field: string;
  allowlist: string[];
}

export interface MaxValuePolicy extends PolicyRule {
  type: 'max_value';
  field: string;
  max: number;
}

export interface TimeRestrictionPolicy extends PolicyRule {
  type: 'time_restriction';
  allowedHoursUtc: { start: number; end: number };
}

export interface RequiredFieldPolicy extends PolicyRule {
  type: 'required_field';
  fields: string[];
}

export type Policy =
  | AllowlistPolicy
  | MaxValuePolicy
  | TimeRestrictionPolicy
  | RequiredFieldPolicy;

export interface PolicyViolation {
  policyId: string;
  toolName: string;
  timestamp: number;
  action: 'block' | 'modify';
  reason: string;
  args: Record<string, unknown>;
}

export interface PolicyEngineConfig {
  policies: Policy[];
  onViolation?: (violation: PolicyViolation) => void;
}

function matchesTool(policyTool: string | string[], toolName: string): boolean {
  if (Array.isArray(policyTool)) {
    return policyTool.includes(toolName);
  }
  if (policyTool === '*') return true;
  return policyTool === toolName;
}

function matchesAllowlist(value: string, allowlist: string[]): boolean {
  return allowlist.some(pattern => {
    if (pattern.startsWith('*.')) {
      return value.endsWith(pattern.slice(1));
    }
    return value === pattern;
  });
}

export function createPolicyEnginePlugin(
  config: PolicyEngineConfig
): EnterprisePlugin {
  const violations: PolicyViolation[] = [];
  const policies = config.policies.filter(p => p.enabled !== false);

  function evaluate(
    toolName: string,
    args: Record<string, unknown>
  ): PluginToolDecision {
    for (const policy of policies) {
      if (!matchesTool(policy.tool, toolName)) continue;

      switch (policy.type) {
        case 'allowlist': {
          const p = policy as AllowlistPolicy;
          const value = args[p.field];
          if (typeof value === 'string' && !matchesAllowlist(value, p.allowlist)) {
            const violation: PolicyViolation = {
              policyId: p.id,
              toolName,
              timestamp: Date.now(),
              action: p.action,
              reason: `${p.field} "${value}" is not in the allowlist`,
              args: { ...args },
            };
            violations.push(violation);
            config.onViolation?.(violation);
            if (p.action === 'block') {
              return { allow: false, reason: violation.reason };
            }
          }
          break;
        }

        case 'max_value': {
          const p = policy as MaxValuePolicy;
          const value = Number(args[p.field]);
          if (!isNaN(value) && value > p.max) {
            const violation: PolicyViolation = {
              policyId: p.id,
              toolName,
              timestamp: Date.now(),
              action: p.action,
              reason: `${p.field} value ${value} exceeds maximum of ${p.max}`,
              args: { ...args },
            };
            violations.push(violation);
            config.onViolation?.(violation);
            if (p.action === 'block') {
              return { allow: false, reason: violation.reason };
            }
            if (p.action === 'modify') {
              return { allow: true, modifiedArgs: { [p.field]: p.max } };
            }
          }
          break;
        }

        case 'time_restriction': {
          const p = policy as TimeRestrictionPolicy;
          const hour = new Date().getUTCHours();
          if (hour < p.allowedHoursUtc.start || hour >= p.allowedHoursUtc.end) {
            const violation: PolicyViolation = {
              policyId: p.id,
              toolName,
              timestamp: Date.now(),
              action: p.action,
              reason: `Tool ${toolName} is restricted to ${p.allowedHoursUtc.start}:00-${p.allowedHoursUtc.end}:00 UTC`,
              args: { ...args },
            };
            violations.push(violation);
            config.onViolation?.(violation);
            if (p.action === 'block') {
              return { allow: false, reason: violation.reason };
            }
          }
          break;
        }

        case 'required_field': {
          const p = policy as RequiredFieldPolicy;
          const missing = p.fields.filter(f => !(f in args) || args[f] == null || args[f] === '');
          if (missing.length > 0) {
            const violation: PolicyViolation = {
              policyId: p.id,
              toolName,
              timestamp: Date.now(),
              action: p.action,
              reason: `Missing required fields: ${missing.join(', ')}`,
              args: { ...args },
            };
            violations.push(violation);
            config.onViolation?.(violation);
            if (p.action === 'block') {
              return { allow: false, reason: violation.reason };
            }
          }
          break;
        }
      }
    }

    return { allow: true };
  }

  return {
    name: 'policy_engine',
    description: 'Query active policies and violation history',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list_policies', 'list_violations'],
          description: 'Action to perform',
        },
      },
      required: ['action'],
    },
    manifest: {
      version: '1.0.0',
      author: 'Agorio',
      category: 'governance',
      tier: 'enterprise',
    },

    handler(args) {
      if (args.action === 'list_policies') {
        return {
          policies: policies.map(p => ({
            id: p.id,
            type: p.type,
            tool: p.tool,
            action: p.action,
            description: p.description,
          })),
        };
      }
      if (args.action === 'list_violations') {
        return { violations: [...violations] };
      }
      return { error: `Unknown action: ${args.action}` };
    },

    onBeforeToolCall(toolName, args) {
      return evaluate(toolName, args);
    },

    getState() {
      return {
        policyCount: policies.length,
        violationCount: violations.length,
        violations: [...violations],
      };
    },
  };
}
