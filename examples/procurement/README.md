# Procurement reference agent

The headline v0.7 demo: a B2B procurement agent that comparison-shops three merchants, requires approval above a configurable threshold, attaches a purchase-order number, categorizes the expense, completes checkout, and streams the entire run to [Agorio Cloud](https://cloud.agorio.dev/traces).

```bash
npx tsx examples/procurement/index.ts
```

## What's wired up

Composed via [`AgentChain`](../../src/agent/agent-chain.ts) — three sub-agents run sequentially:

1. **`find-best-price`** — calls `discover_merchant` on each configured store, then `compare_prices` to pick the lowest-total option.
2. **`request-approval`** — discovers the winning merchant, adds the cart, calls `procurement → assign_po_number` and `procurement → categorize_expense`, and (above the $1k threshold) routes through the [`approval-workflow`](../../plugins/approval-workflow) plugin.
3. **`checkout-and-track`** — submits payment with the PO# attached and subscribes to order updates.

All five governance plugins are active throughout:

| Plugin | Role |
| --- | --- |
| [`@agorio/plugin-agent-identity`](../../plugins/agent-identity) | Tags every action with org, department, and approver email |
| [`@agorio/plugin-spending-controls`](../../plugins/spending-controls) | Per-transaction ($5k) + daily ($25k) caps |
| [`@agorio/plugin-approval-workflow`](../../plugins/approval-workflow) | Pauses for human approval above $1k |
| [`@agorio/plugin-audit-trail`](../../plugins/audit-trail) | Structured log of every tool call |
| [`@agorio/plugin-procurement`](../../plugins/procurement) | PO# generation, vendor lookup, expense category, audit event on success |

## Run modes

### Self-host (default — no external accounts)

`npx tsx examples/procurement/index.ts`

Three [`MockMerchant`](../../src/mock/mock-merchant.ts) instances on random ports. Zero credentials. Useful for local development and CI.

### Full demo (real merchants)

Add a Shopify development store and a local WooCommerce:

```bash
docker-compose -f examples/procurement/docker-compose.yml up -d   # WooCommerce on :8088
export AGORIO_SHOPIFY_STORE=agorio-procurement-demo               # see shopify-seed.md
export AGORIO_SHOPIFY_TOKEN=<storefront-access-token>
export AGORIO_API_KEY=<your cloud.agorio.dev key>                 # optional, ships trace
npx tsx examples/procurement/index.ts --full
```

See [`shopify-seed.md`](./shopify-seed.md) for the one-time Shopify B2B dev store setup.

## Cloud trace

Set `AGORIO_API_KEY` (mint at [cloud.agorio.dev/api-keys](https://cloud.agorio.dev/api-keys)) and the run posts to the ingestion endpoint. The trace explorer renders the multi-agent run as a tree — three sub-agent blocks indented under the parent, with PO# / vendor / category visible in the audit-trail log section.

## Session resume

For demos showing durable approval waits, wire [`FileSessionStorage`](../../src/session/file-storage.ts) (or [`@agorio/session-redis`](../../packages/session-redis) in production) into the `request-approval` sub-agent — `sessionStorage: storage, sessionId: 'po-1234'`. Kill the process after the approval block; restart with the same `sessionId` and the run continues from the persisted iteration. See the SDK docs for the full pattern.

## CI smoke test

[`procurement.test.ts`](./procurement.test.ts) runs the chain against three MockMerchants on every commit (picked up by the root vitest config) — no external dependencies, ensures the headline demo doesn't bit-rot.
