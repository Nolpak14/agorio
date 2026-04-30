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
    '[@agorio/plugin-agent-identity] AGORIO_LICENSE_KEY not set or invalid. ' +
    'Get your key at https://agorio.dev/pricing'
  );
}

export interface AgentIdentityConfig {
  organizationId: string;
  organizationName: string;
  department?: string;
  agentId?: string;
  contactEmail?: string;
  permissions?: string[];
  metadata?: Record<string, string>;
}

export interface AgentIdentity extends AgentIdentityConfig {
  registeredAt: number;
}

export function createAgentIdentityPlugin(
  config: AgentIdentityConfig
): EnterprisePlugin {
  const identity: AgentIdentity = {
    ...config,
    registeredAt: Date.now(),
  };
  const activityLog: Array<{
    toolName: string;
    timestamp: number;
    merchant: string | null;
  }> = [];

  return {
    name: 'agent_identity',
    description: 'Retrieve the identity information for this AI agent, including organization, department, and permissions',
    parameters: {
      type: 'object',
      properties: {
        includeActivity: {
          type: 'boolean',
          description: 'Include recent activity log in the response',
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
      const response: Record<string, unknown> = {
        identity: {
          organizationId: identity.organizationId,
          organizationName: identity.organizationName,
          department: identity.department,
          agentId: identity.agentId,
          contactEmail: identity.contactEmail,
          permissions: identity.permissions,
        },
      };
      if (args.includeActivity) {
        response.recentActivity = activityLog.slice(-20);
      }
      return response;
    },

    onRegister() {
      if (!config.organizationId || !config.organizationName) {
        throw new Error(
          '[@agorio/plugin-agent-identity] organizationId and organizationName are required'
        );
      }
    },

    onBeforeToolCall(toolName, _args, context) {
      activityLog.push({
        toolName,
        timestamp: Date.now(),
        merchant: context.getActiveMerchant(),
      });
      return { allow: true };
    },

    getState() {
      return {
        identity,
        activityCount: activityLog.length,
      };
    },
  };
}
