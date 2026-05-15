# @agorio/plugin-audit-trail

Structured logging of every tool call made by an [Agorio SDK](https://agorio.dev) agent. Supports console output, webhook batching, and custom callbacks with field redaction.

## Install

```bash
npm install @agorio/plugin-audit-trail @agorio/sdk
```

## Usage

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { createAuditTrailPlugin } from '@agorio/plugin-audit-trail';

const audit = createAuditTrailPlugin({
  output: 'callback',
  includeArgs: true,
  includeResults: false,
  redactFields: ['cardNumber', 'cvv'],
  callback: (entry) => {
    myLoggingSystem.write(entry);
  },
});

const agent = new ShoppingAgent({
  llm: myLlmAdapter,
  plugins: [audit],
});

await agent.run('Find me a laptop under $1000');

// Retrieve the full log at any time:
const state = audit.getState?.();
console.log(state?.log);
```

## Config

| Option | Type | Description |
|--------|------|-------------|
| `output` | `'console' \| 'webhook' \| 'callback'` | Where to emit entries (default: `'console'`) |
| `webhookUrl` | `string` | (optional) POST batches to this URL when `output: 'webhook'` |
| `callback` | `function` | Called per entry when `output: 'callback'` |
| `includeArgs` | `boolean` | Include tool arguments in entries (default: `true`) |
| `includeResults` | `boolean` | Include tool results in entries (default: `false`) |
| `redactFields` | `string[]` | Field names to replace with `'[REDACTED]'` |
| `batchSize` | `number` | Batch size for webhook delivery (default: `10`) |

## License

MIT
