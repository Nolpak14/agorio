# Changelog

All notable changes to `@agorio/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
