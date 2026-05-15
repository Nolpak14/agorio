# @agorio/plugin-spending-controls

Enforce per-transaction, session, and daily spending limits on AI shopping agents built with the [Agorio SDK](https://agorio.dev).

## Install

```bash
npm install @agorio/plugin-spending-controls @agorio/sdk
```

## Usage

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { createSpendingControlsPlugin } from '@agorio/plugin-spending-controls';

const spendingControls = createSpendingControlsPlugin({
  perTransactionLimit: 500,   // block any single purchase > $500
  sessionLimit: 1000,          // block once session total > $1000
  dailyLimit: 2000,            // block once today's spend > $2000
  currency: 'USD',
  onLimitExceeded: (details) => {
    console.warn('Spending limit hit:', details);
  },
});

const agent = new ShoppingAgent({
  llm: myLlmAdapter,
  plugins: [spendingControls],
});

await agent.run('Buy running shoes under $150');
```

## Config

| Option | Type | Description |
|--------|------|-------------|
| `perTransactionLimit` | `number` | Maximum spend per single transaction |
| `sessionLimit` | `number` | (optional) Maximum total spend for the agent session |
| `dailyLimit` | `number` | (optional) Maximum total spend within a rolling 24h window |
| `currency` | `string` | Currency code for error messages (default: `'USD'`) |
| `onLimitExceeded` | `function` | Callback fired when a limit is about to be exceeded |

## License

MIT
