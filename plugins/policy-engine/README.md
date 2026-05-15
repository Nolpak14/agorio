# @agorio/plugin-policy-engine

JSON-based rule evaluator for [Agorio SDK](https://agorio.dev) agents. Define policies that block or modify tool calls based on allowlists, value caps, time windows, and required fields.

## Install

```bash
npm install @agorio/plugin-policy-engine @agorio/sdk
```

## Usage

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { createPolicyEnginePlugin } from '@agorio/plugin-policy-engine';

const policies = createPolicyEnginePlugin({
  policies: [
    {
      id: 'approved-merchants',
      type: 'allowlist',
      tool: 'discover_merchants',
      field: 'domain',
      allowlist: ['*.myshopify.com', 'shop.acme.com'],
      action: 'block',
      description: 'Only approved merchants',
    },
    {
      id: 'quantity-cap',
      type: 'max_value',
      tool: 'add_to_cart',
      field: 'quantity',
      max: 10,
      action: 'modify',
      description: 'Cap order quantities at 10',
    },
    {
      id: 'business-hours',
      type: 'time_restriction',
      tool: '*',
      allowedHoursUtc: { start: 8, end: 20 },
      action: 'block',
      description: 'Only allow purchases during business hours (UTC)',
    },
  ],
  onViolation: (v) => console.warn('Policy violated:', v),
});

const agent = new ShoppingAgent({
  llm: myLlmAdapter,
  plugins: [policies],
});

await agent.run('Order 20 keyboards from an unapproved supplier');
```

## Policy Types

| Type | Blocks when... |
|------|---------------|
| `allowlist` | A field value is not in the allowlist |
| `max_value` | A numeric field exceeds `max` (can `modify` instead of `block`) |
| `time_restriction` | Current UTC hour is outside `allowedHoursUtc` |
| `required_field` | One or more required fields are missing or empty |

## License

MIT
