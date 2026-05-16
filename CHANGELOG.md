# Changelog

All notable changes to `@agorio/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.6.0] — 2026-05-16 — Agorio Cloud MVP

### Highlights

The Pro tier finally has its product. `agorioCloud({ apiKey })` ships traces from any `ShoppingAgent` to a hosted dashboard at `cloud.agorio.dev`. Every run shows up as a drill-down view with the tool-call timeline, LLM token costs, and structured logs, ingested in <5 s.

### Added

- **`agorioCloud()` client helper** (`src/cloud/index.ts`) — wraps the SDK's existing `tracer`, `onLog`, `onStep` primitives and POSTs structured events to a hosted ingestion endpoint. Returns a handle you spread into `AgentOptions`. Buffers spans/logs in memory, flushes on size threshold (default 25) or interval (default 1 s) via `fetch({ keepalive: true })`. Network errors are caught and logged with `console.warn` — they never surface to the running agent. Exports: `agorioCloud`, `AgorioCloudOptions`, `AgorioCloudHandle`, plus wire-format types (`SpanRecord`, `LogRecord`, `IngestBatch`, `IngestBatchType`, `RunStartPayload`, `RunEndPayload`). New `./cloud` subpath export.
- **`AgentOptions.onComplete?: (r: AgentResult) => void | Promise<void>`** — called once after every agent run (success, max-iter, or error). Used internally by `agorioCloud()` to drain its buffer and POST the final usage summary; available for custom integrations too.
- **`cloud/` Next.js 15 app** — sibling to `site/`, deployed to `cloud.agorio.dev`. Routes:
  - `/login` — Neon Auth sign-in (same provider as `site/`).
  - `/traces` — paginated list of recent runs for the authenticated customer, ordered by `started_at desc`.
  - `/traces/[runId]` — drill-down: summary card with usage grid, span table (Gantt-style with attributes), log table (level-colored), final answer / error. Polls every 2 s while status is `in_progress`.
  - `/api/ingest` — POST endpoint with `Bearer` auth, in-memory key cache (60 s TTL), debounced `last_used_at` updates (60 s per key), bulk insert for spans/logs, returns 202 Accepted.
  - `/api/auth/[...path]` — Neon Auth handler.
- **API key management on `/dashboard`** — server actions `createApiKey` and `revokeApiKey` (`site/app/dashboard/actions.ts`). Keys are scoped per environment (`dev`/`prod`/`test`), generated as `agorio_sk_<env>_<32hex>`, displayed once in a one-time reveal card, then masked everywhere else as `keyPrefix...`. Revoke is a soft-delete to preserve `traceRuns.apiKeyId` referential integrity.
- **Schema additions** (`site/db/schema.ts` and `cloud/db/schema.ts`, kept in sync):
  - `api_keys` table — per-environment Cloud API keys, FK to `customers`.
  - `trace_runs` table — one row per `agorioCloud()`-instrumented agent run, indexed `(customer_id, started_at desc)`.
  - `trace_spans` table — one row per span; cascade-deletes with parent run.
  - `trace_logs` table — one row per structured log event; cascade-deletes with parent run.
  - Three new `pgEnum`s: `api_key_env`, `trace_status`, `trace_log_level`.
- **`buildResult(success, answer, error?)`** — third argument added so the streaming-error exit point produces a proper `AgentResult` with `result.error` populated.

### Changed

- **Pricing page** (`site/app/pricing/page.tsx`) — Pro tier reframed from "Cloud early access (Q3 2026)" to "Cloud — available now (Beta)". Features list now distinguishes shipped (trace explorer, API key management, audit exports) from coming-soon items (hosted approval receiver, fleet view, CI mock merchants). FAQ rewritten with "What ships in Cloud today?" and "How do I send my first trace?".
- **Success page** (`site/app/success/page.tsx`) — post-checkout onboarding now walks users through "create API key → wire `agorioCloud()` into your agent → see your first trace at cloud.agorio.dev/traces".
- **Dashboard** (`site/app/dashboard/page.tsx`) — adds the API Keys section with a `#api-keys` anchor link; existing license-key + plan + billing-portal cards retained.
- **`package.json`** — bumped to `0.6.0`; new `"./cloud"` entry in `exports`.

### Tests

306 tests across 18 test files (was 301 across 17). New file:
- `tests/cloud.test.ts` — 5 tests: span timestamp gap is filled, batching at threshold + final drain, Bearer header + URL + payload shape, fetch errors swallowed, `beginRun().complete()` lifecycle.

### Deferred to v0.6.1

- Hosted approval-workflow webhook receiver with click-to-approve UI (needs a new SDK primitive for agent-side approval polling)
- Hosted mock merchants gated by license key
- Fleet view / org-level rollup
- Stale-run sweeper for crashed agents
- Promotion of `db/` and `lib/auth-server.ts` into a `shared/` workspace package (currently duplicated between `site/` and `cloud/` with sync headers)

---

## [0.5.0] — 2026-05-15 — Open Core Release

### Highlights

This is the Open Core release. All five governance plugins are relicensed MIT and ready to publish as `@agorio/plugin-*`. The SDK gains its second real-merchant adapter (WooCommerce), an experimental AP2 payment client, and Shopify's new UCP discovery path.

### Added

- **WooCommerce adapter** (`WooCommerceAdapter`) — connects agents to any WooCommerce (WordPress) store via the REST API v3. Public browsing works without credentials; checkout requires a consumer key/secret pair. The agent auto-detects WooCommerce stores via an `/wp-json/wc/v3` probe when no adapter is pre-registered. Exports: `WooCommerceAdapter`, `WooCommerceAdapterError`, `isWooCommerceStore`, `WooCommerceAdapterOptions`. ([#43])
- **AP2 client** (`Ap2Client`) — experimental Agent Payments Protocol (FIDO Alliance) client. Implements the mandate-based flow: `createIntentMandate` → `attachCart` → `sign` → `submitPayment`. Ships with a deterministic mock signer (`mock_sig_` prefix) for tests and CI. Add `experimental_ap2: true` to `AgentOptions` to opt in. Exports: `Ap2Client`, `Ap2Error`, `IntentMandate`, `CartMandate`, `CartLineItem`, `SignedMandate`, `Ap2PaymentResult`, `Ap2ClientOptions`. ([#42])
- **Shopify UCP migration** — `ShopifyAdapter` now prefers `/.well-known/ucp` discovery for all `*.myshopify.com` stores (set `preferUcp: false` to force Storefront GraphQL). Handles both array-format and object-keyed capability maps. Public `tryUcpDiscovery()` method for testing. `MerchantAdapterDiscovery.protocol` now accepts `'ucp'`. ([#41])
- **Plugin development guide** (`docs/plugin-development.md`) — full walk-through of `AgentPlugin` vs `EnterprisePlugin`, all four lifecycle hooks, `PluginContext` API, a complete wishlist plugin example, and publishing conventions. Linked from `README.md` and `CONTRIBUTING.md`. ([#45])
- `AgentOptions.experimental_ap2?: boolean` — opt-in flag for AP2 payment flow (stored, not yet wired through the agent loop).

### Changed

- **Plugin licenses** — all five plugins (`spending-controls`, `approval-workflow`, `audit-trail`, `agent-identity`, `policy-engine`) relicensed from proprietary to **MIT**. License-key gate removed from all plugin `onRegister` hooks. Each plugin now has a `LICENSE` file and a `README.md`. ([#40])
- **Pricing page** (`site/app/pricing/page.tsx`) — Pro tier repositioned as "Agorio Cloud" early access (launching Q3 2026). Free tier now explicitly includes all five governance plugins. Plugin catalog badges changed from "Pro"/"Enterprise" to "Open Source". FAQ section added explaining Open Core model. ([#44])
- **README** — added "Connect to a real store" section with Shopify and WooCommerce examples, adapter comparison table, and `isWooCommerceStore` probe usage. Roadmap updated to mark all v0.5 items complete.

### Fixed

- `ShoppingAgent.toolDiscoverMerchant` — WooCommerce auto-detection now fires after UCP/ACP probes when no matching adapter is pre-registered.

### Tests

301 tests across 17 test files (was 252 across 16). New files:
- `tests/woocommerce-adapter.test.ts` — 21 tests
- `tests/ap2-client.test.ts` — 21 tests
- `tests/shopify-ucp-migration.test.ts` — 10 tests

---

## [0.4.2] — 2026-05-01

- Enterprise plugin system: 5 governance plugins (`spending-controls`, `approval-workflow`, `audit-trail`, `agent-identity`, `policy-engine`)
- Stripe billing + Neon Postgres customer dashboard
- Resend transactional email
- `agorio plugin list|install|info` CLI subcommands
- 252 tests across 16 test files

## [0.4.0] — 2026-04-15

- Multi-merchant architecture — `switch_merchant`, `compare_prices` tools
- Shopify Storefront API adapter (`ShopifyAdapter`)
- Webhook order tracking (`WebhookServer`)
- Browser playground (site)
- 17 built-in shopping tools
- 233 tests

## [0.3.0] — 2026-03-20

- MCP transport (`McpClient`, `MockMcpMerchant`)
- Plugin system (`AgentPlugin`, `EnterprisePlugin`)
- Observability: `onLog`, `tracer`, `AgentUsageSummary`
- CLI (`npx agorio`)
- Ollama adapter
- 191 tests

## [0.2.0] — 2026-02-15

- Claude adapter, OpenAI adapter
- ACP client + mock ACP merchant
- Streaming (`runStream`, `chatStream`)
- Landing page
- 113 tests

## [0.1.0] — 2026-01-20

- Initial release: UCP client, Gemini adapter, mock merchant, basic agent loop
