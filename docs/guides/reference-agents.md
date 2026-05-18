# Reference agents

A curated index of runnable example agents that cover the major shapes of agentic commerce
work. All examples live in `examples/` and are exercised by CI on every release.

## Consumer shopping

- **`examples/deal-finder.ts`** — multi-merchant price comparison across two MockMerchants.
  Demonstrates `adapters:` injection and the `compare_prices` tool.
- **`examples/price-comparison.ts`** — dual-protocol (UCP + ACP) over the same query. Shows
  that the agent's tool surface is unchanged regardless of merchant protocol.
- **`examples/product-researcher.ts`** — streaming output + product detail expansion. Useful as
  a template for chat-style UIs.

## Real-merchant integrations

- **`examples/real-merchant.ts`** — Shopify and WooCommerce integration template. Drop in your
  Storefront API token or consumer key/secret to point at a live store.

## B2B procurement (v0.7+)

- **`examples/procurement/`** — the headline procurement agent. Chains three sub-agents
  (find-best-price → request-approval → checkout-and-track) over three MockMerchants. All
  six governance plugins active. Output is exercised in CI via
  `examples/procurement/procurement.test.ts`.

## Compliance + audit (v0.8+)

A worked example is not yet in `examples/`, but the procurement example already produces a
full audit trail visible in Cloud's trace explorer and downloadable via
`/api/compliance/export`. See [compliance.md](../compliance.md) for the data flow.

## Self-hosted (v1.0+)

- **`docker/`** — Docker Compose for a fully self-hosted Cloud (Postgres + cloud app +
  optional Redis for session storage). Suitable for air-gapped or EU-residency deployments.
  See [docs/self-hosted.md](./self-hosted.md).

## Writing your own

If you build an agent worth sharing, please open a PR adding it to `examples/` with:

1. A standalone script (importable from `@agorio/sdk`, no workspace cheats).
2. A short README in the example folder describing what it demonstrates and how to run it.
3. A smoke test under `examples/<name>/<name>.test.ts` (excluded from root vitest if it brings
   its own deps).
