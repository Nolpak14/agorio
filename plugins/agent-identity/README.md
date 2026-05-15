# @agorio/plugin-agent-identity

Attach organizational identity to an [Agorio SDK](https://agorio.dev) shopping agent — org name, department, agent ID, permissions, and an activity log.

## Install

```bash
npm install @agorio/plugin-agent-identity @agorio/sdk
```

## Usage

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { createAgentIdentityPlugin } from '@agorio/plugin-agent-identity';

const identity = createAgentIdentityPlugin({
  organizationId: 'org_acme_corp',
  organizationName: 'Acme Corp',
  department: 'Procurement',
  agentId: 'procurement-agent-01',
  contactEmail: 'procurement@acme.com',
  permissions: ['browse', 'add_to_cart', 'submit_payment'],
  metadata: { costCenter: 'CC-4210' },
});

const agent = new ShoppingAgent({
  llm: myLlmAdapter,
  plugins: [identity],
});

await agent.run('Compare prices for ergonomic chairs');
```

The plugin exposes an `agent_identity` tool the LLM can call to inspect its own identity, and logs every tool invocation to an internal activity log.

## Config

| Option | Type | Description |
|--------|------|-------------|
| `organizationId` | `string` | **Required.** Unique org identifier |
| `organizationName` | `string` | **Required.** Human-readable org name |
| `department` | `string` | (optional) Department within the org |
| `agentId` | `string` | (optional) Unique identifier for this agent instance |
| `contactEmail` | `string` | (optional) Responsible-party email |
| `permissions` | `string[]` | (optional) Declared agent capabilities |
| `metadata` | `Record<string, string>` | (optional) Arbitrary key/value metadata |

## License

MIT
