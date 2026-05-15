# @agorio/plugin-approval-workflow

Require human approval before an AI shopping agent completes high-value purchases. Integrates with [Agorio SDK](https://agorio.dev).

## Install

```bash
npm install @agorio/plugin-approval-workflow @agorio/sdk
```

## Usage

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { createApprovalWorkflowPlugin } from '@agorio/plugin-approval-workflow';

const approval = createApprovalWorkflowPlugin({
  requireApprovalAbove: 200,   // require approval for purchases > $200
  autoApproveBelow: 50,         // auto-approve anything < $50
  webhookUrl: 'https://your-app.com/api/approve',
  onApprovalRequired: (request) => {
    console.log('Approval needed:', request.requestId, request.amount);
  },
});

const agent = new ShoppingAgent({
  llm: myLlmAdapter,
  plugins: [approval],
});

await agent.run('Order office supplies totalling $350');
```

When a transaction exceeds the threshold the agent is blocked and receives a `requestId`. A human (or another system) approves or denies via the `approval_workflow` tool or the optional webhook.

## Config

| Option | Type | Description |
|--------|------|-------------|
| `requireApprovalAbove` | `number` | Approval threshold in the configured currency |
| `autoApproveBelow` | `number` | (optional) Skip approval gate for amounts below this |
| `webhookUrl` | `string` | (optional) POST approval requests here as JSON |
| `timeoutMs` | `number` | (optional) Request timeout in ms |
| `currency` | `string` | Currency code for messages (default: `'USD'`) |
| `onApprovalRequired` | `function` | Callback fired when approval is needed |

## License

MIT
