# Agorio SDK Roadmap

> **Last updated:** 2026-05-18 (v0.9.0 shipped). This roadmap supersedes earlier versions. The pivot from "paid plugins" to "open core + Agorio Cloud" is described in [docs/monetization.md](monetization.md). The road to v1.0.0 GA is tracked in [docs/v1.0-plan.md](v1.0-plan.md) and umbrella issue [#61](https://github.com/Nolpak14/agorio/issues/61).

## Strategic positioning

Agorio is the **protocol-neutral SDK for building AI commerce agents**. The bet:

1. **Triple-protocol coverage.** UCP (Google + Shopify), ACP (OpenAI + Stripe), and MCP (Anthropic) are all real and adopting in parallel. AP2 (FIDO Alliance) is emerging for payments. Agorio is the only open-source SDK that speaks all four. As Shopify migrates MCP → UCP (effective May 30, 2026) and AP2 moves under FIDO, this neutrality is structurally valuable.
2. **Builder-side, not consumer-side.** Atlas (OpenAI), Comet (Perplexity), and Mariner (Google) own the consumer agent UX. Agorio serves developers building *their own* commerce agents — B2B procurement, internal expense tools, retailer-owned shopping assistants, AI startups.
3. **Governance as wedge.** EU AI Act enforcement begins Aug 2, 2026 with fines up to 7% of global revenue. Enterprise procurement teams need audit-ready records *now*. Agorio's plugin system maps directly to this demand.

---

## Shipped

### v0.1.0 — Foundation (Feb 19, 2026)

- Gemini adapter (Google Generative AI) with function calling
- UCP client with `/.well-known/ucp` discovery and REST API
- ShoppingAgent with plan-act-observe loop
- 12 shopping tool definitions (JSON Schema)
- MockMerchant — UCP-compliant Express test server
- LlmAdapter interface for any LLM with function calling
- 37 tests
- Published as `@agorio/sdk` on npm

### v0.2.0 — Multi-LLM & Protocol Expansion (Feb 19, 2026)

- Claude adapter, OpenAI adapter (native function calling)
- Streaming support — `runStream()` + `chatStream()` on all adapters
- ACP client — full checkout session lifecycle
- MockAcpMerchant — ACP-compliant Express test server
- Dual-protocol ShoppingAgent — auto-detects UCP vs ACP
- agorio.dev landing page
- 113 tests

### v0.3.0 — Marketplace Foundation & Observability (Feb 20, 2026)

- MCP transport support — JSON-RPC 2.0 client with auto-detection and REST fallback
- Plugin system — custom tool extension with JSON Schema parameters
- Observability — structured logging (`onLog`), OpenTelemetry-compatible tracing, usage metrics on every result
- CLI tool (`npx agorio`) — `mock`, `discover`, `init` commands
- Contributing guide
- Ollama adapter — fully local/offline agents
- Reference agents — deal finder, price comparison, product researcher
- 191 tests

### v0.4.0 — Multi-Merchant & Real Commerce (Feb 27, 2026)

- Multi-merchant architecture — isolated per-merchant state, price comparison across stores
- Shopify adapter — Storefront GraphQL API, auto-detected by `*.myshopify.com` domain
- Webhook support — `WebhookServer` with HMAC-SHA256, `subscribe_order_updates` tool
- 4 new shopping tools — `switch_merchant`, `compare_prices`, `get_product_reviews`, `apply_discount_code`
- Browser playground (Next.js static export) at agorio.dev/playground
- 233 tests

Detailed retrospective: [docs/v0.4-plan.md](v0.4-plan.md).

### v0.4.2 — Monetization Layer (May 2026)

The Stripe + Neon + customer-dashboard scaffolding shipped under the v0.4.x line. Not yet a major release because the plugin distribution model is being repositioned in v0.5.

- **Enterprise plugin system** — middleware refactor with `EnterprisePlugin`, `PluginContext`, `onRegister` / `onInit` / `onBeforeToolCall` (block/modify) / `onAfterToolCall` hooks
- **5 governance plugins** under `plugins/` — spending-controls, approval-workflow, audit-trail, agent-identity, policy-engine
- **Stripe billing** — Pro tier ($149/yr or $19/mo), live mode, full webhook handler
- **Neon Postgres + Drizzle ORM** — `customers` table for license-key storage
- **Customer dashboard** at `/dashboard` — license key display, Stripe billing portal
- **Neon Auth** for session management
- **Resend** for transactional email
- **CLI plugin commands** — `agorio plugin list | install | info`
- 252 tests passing across 16 test files

### v0.5.0 — Open Core Release (May 2026)

- [x] **Relicense the 5 plugins as MIT** — added LICENSE files, removed proprietary language
- [x] **Publish to npm** — `@agorio/plugin-spending-controls`, `-approval-workflow`, `-audit-trail`, `-agent-identity`, `-policy-engine`
- [x] **Remove license-key gating** from plugin runtime
- [x] **UCP profile compatibility updates** — `ShopifyAdapter` prefers `/.well-known/ucp` for `*.myshopify.com`, handles both array and object capability formats. New regression test file: `shopify-ucp-migration.test.ts`.
- [x] **AP2 client (initial)** — `Ap2Client` with Intent Mandate and Cart Mandate signing, behind `experimental_ap2` feature flag. 21 tests.
- [x] **WooCommerce adapter** — REST API v3, auto-detected via `/wp-json/wc/v3` probe, read-only without credentials, checkout with consumer key/secret. 21 tests.
- [x] **Pricing page rewrite** — Pro tier repositioned as Agorio Cloud early-access
- [x] **Plugin development guide** — `docs/plugin-development.md`
- 301 tests across 17+ test files

Detailed plan: [docs/v0.5-plan.md](v0.5-plan.md).

### v0.6.0 — Agorio Cloud MVP (May 2026)

- [x] **`agorioCloud({ apiKey })` SDK helper** — wraps existing `tracer`/`onLog`/`AgentResult.usage` and POSTs traces to the ingestion endpoint. New `AgentOptions.onComplete` callback wired through `ShoppingAgent.run` / `runStream`. Spread into `AgentOptions` and you're done.
- [x] **Hosted dashboard at `cloud.agorio.dev`** — sibling Next.js app sharing the Neon DB with `site/`. Routes: `/auth/[pathname]`, `/traces`, `/traces/[runId]`, `/api-keys`, `/api/ingest`, `/api/auth/[...path]`.
- [x] **Trace explorer** — per-run drilldown with usage grid, span table, level-colored log table, final answer / error block. Auto-refreshes every 2 s while a run is `in_progress`.
- [x] **API key management on cloud** — per-env keys (`dev`/`prod`/`test`), one-time reveal, soft-delete revoke. Keys are masked everywhere after creation. (Initially shipped on site; migrated to cloud post-launch — see "Post-launch patches" in [v0.6-plan.md](v0.6-plan.md).)
- [x] **Auth surface redesign** — terminal-frame design over better-auth-ui's shadcn components, mapped to Agorio brand via `--neon-*` token overrides. Dynamic `/auth/[pathname]` route handles sign-in, sign-up, forgot-password, reset-password, verify-email, callback.
- [x] **Cross-subdomain sessions** — `cookies.domain: '.agorio.dev'` in production, plus `cloud.agorio.dev` added to Neon Auth's Trusted Domains. Users signed in on either subdomain are authenticated on both.
- [x] **Schema additions** — `api_keys`, `trace_runs`, `trace_spans`, `trace_logs` with three new pgEnums. Migrations owned by `site/`; `cloud/db/schema.ts` is duplicated with a sync header.
- [x] **Pricing copy + onboarding** — `/pricing` reframed "available now (Beta)"; `/success` walks new subscribers through API key → first trace on Cloud.
- 306 tests across 18 test files.

Detailed plan + post-launch patches: [docs/v0.6-plan.md](v0.6-plan.md). User-facing setup guide: [docs/cloud-setup.md](cloud-setup.md). Operational runbook: [docs/v0.6-release-checklist.md](v0.6-release-checklist.md).

---

### v0.7.0 — B2B Procurement Vertical (May 2026)

- [x] **HTTP retry + rate-limit primitives** — `createHttpClient`, `withRetry`, `TokenBucket`, `withRateLimit`. Drop into any adapter's `fetch:` option.
- [x] **Agent composition primitives** — `runSubAgent` + `AgentChain`, with `parent_span_id` injection so Cloud renders multi-agent runs as a tree.
- [x] **Persistent sessions** — `SessionStorage` interface, `MemorySessionStorage` + `FileSessionStorage` in-tree, separate `@agorio/session-redis` package. Plugin `hydrate()` hook for stateful plugins (approval-workflow uses it).
- [x] **`@agorio/plugin-procurement`** — sixth governance plugin with PO# tracking, vendor lookup, expense categorization, `requirePoOnCheckout` enforcement.
- [x] **Procurement reference agent** in `examples/procurement/` with CI smoke test against three MockMerchants. WooCommerce docker-compose + Shopify dev store setup documented for full-demo mode.
- [x] **Cloud trace explorer hierarchy** — sub-agent strip + indented spans table.
- [x] **Marketing surface** — `agorio.dev/procurement` landing page, README "v0.7" section.
- 362 tests. Detailed plan: [docs/v0.7-plan.md](v0.7-plan.md).

### v0.8.0 — Compliance & Hardening (May 2026)

- [x] **BigCommerce adapter** (`src/adapters/bigcommerce.ts`) — third real-merchant proof point with feature parity to Shopify + WooCommerce.
- [x] **Agent identity attestation** — `AgentAttestation` HMAC-signed `X-Agorio-Attestation` header, `verifyAttestation` receiver helper, pluggable `sign:` for ed25519 / WebAuthn / KMS schemes.
- [x] **AP2 GA** — promoted from experimental; `experimental_ap2` deprecated. `verifyMandateShape()` receiver helper.
- [x] **EU AI Act compliance export** — `GET /api/compliance/export?from=…&to=…&format=csv` with Annex IV-aligned records + `/compliance` dashboard page.
- [x] **Cloud audit log** — `cloud_audit_log` table + `/audit-log` viewer.
- [x] **RBAC schema** — `orgs` + `org_members` tables landed (schema only; enforcement deferred to v0.9).
- [x] **Bench harness** — `bench/run.ts` + `bench/baseline-v0.8.0.json`.
- [x] **Self-hosted Docker bundle** — `docker/docker-compose.yml` + `docker/cloud.Dockerfile`.
- [x] **Adapter SDK + community-plugin docs** — `docs/adapter-sdk.md`, `docs/community-plugins.md`, `docs/plugins-registry.md`, `docs/adapters-registry.md`, `docs/certification.md`.
- [x] **ADRs 0001–0007** — versioning policy (`docs/semver.md`), migration guide (`docs/migration-0.x-to-1.0.md`).
- 403 tests. Detailed plan: [docs/v0.8-plan.md](v0.8-plan.md).

### v0.9.0 — SDK GA Polish (May 18, 2026)

First release of the v1.0.0 GA program. Locks the public API surface ahead of the 90-day no-breaking-changes clock at v1.0.0-rc.1.

- [x] **Removed `AgentOptions.experimental_ap2`** — the only breaking change in the v1.0 program. One-line migration in [docs/migration-0.x-to-1.0.md](migration-0.x-to-1.0.md).
- [x] **MCP spec methods on `McpClient`** — `initialize`, `notifyInitialized`, `listTools`/`callTool`, `listResources`/`readResource`, `listPrompts`/`getPrompt`. Talk to any standard MCP server (GitHub MCP, Filesystem MCP, custom internal); generic `call()` stays as the escape hatch.
- [x] **UCP introspection helpers** — `getSigningKeys()` / `getSigningKey(kid)`, `getPaymentHandler(id)`, `getA2aEndpoint()`, `getExtensionsOf(parentName)`, `getCapabilityLineage(name)`.
- [x] **ACP idempotency keys** — optional `idempotencyKey` param on all write methods sends `Idempotency-Key` header. Strongly recommended on `completeCheckout`.
- [x] **AP2 `RefundMandate`** — new mandate type with `originalMandateId` + `reason`. `Ap2Client.createRefundMandate()`. Extended `verifyMandateShape`.
- [x] **Cloud RBAC enforcement** — `cloud/lib/rbac.ts` with `requireRole(minimum)` gates api-keys (admin+), traces / audit-log (viewer+); lazy-seeds the 1:1 customer→org + owner-membership pair.
- [x] **Cloud team admin UI** — `/team` with invite / change-role / remove, Resend invite emails. Owner role immutable from UI, admins can't remove themselves, only owners can grant admin. Every action audit-logged.
- 418 tests. Published: [@agorio/sdk@0.9.0](https://www.npmjs.com/package/@agorio/sdk/v/0.9.0).

---

## Planned

### v0.10.0 — Cloud Enterprise & Docs (Target: H2 2026)

Ships everything required for v1.0.0-rc.1 to start the 90-day stability + uptime clocks. Tracked as umbrella issue [#61](https://github.com/Nolpak14/agorio/issues/61).

**SDK protocol coverage** (deferred from v0.9 — need spec alignment before locking shape)
- [ ] Full ACP coverage — refunds, fulfillment, orders, webhook events ([#51](https://github.com/Nolpak14/agorio/issues/51))
- [ ] Full AP2 coverage — x402 stablecoin, `DelegatedMandate`, JWK signature verification ([#52](https://github.com/Nolpak14/agorio/issues/52))

**Cloud enterprise**
- [ ] Enterprise SSO via Neon Auth connectors (Okta, Azure AD, Google Workspace) ([#54](https://github.com/Nolpak14/agorio/issues/54))
- [ ] Helm chart for self-hosted Cloud ([#55](https://github.com/Nolpak14/agorio/issues/55))
- [ ] Per-trace usage-based billing (Stripe metered) ([#56](https://github.com/Nolpak14/agorio/issues/56))
- [ ] Customer portal improvements — invoices, usage history, downgrade flow ([#57](https://github.com/Nolpak14/agorio/issues/57))

**Operations**
- [ ] Public SLA + status page (BetterStack at `status.agorio.dev`) ([#58](https://github.com/Nolpak14/agorio/issues/58))

**Documentation**
- [ ] Nextra docs site at agorio.dev/docs (zero-TODO acceptance gate) ([#59](https://github.com/Nolpak14/agorio/issues/59))

**Ecosystem**
- [ ] Adapter template repo + first community plugin + first non-first-party certified storefront ([#60](https://github.com/Nolpak14/agorio/issues/60))

### v1.0.0-rc.1 → v1.0.0 — Production GA (Target: H1 2027)

After v0.10 ships, cut `v1.0.0-rc.1` to start the four clock-based acceptance criteria. Only patch fixes between rc and GA. Tag `v1.0.0` when all four are green.

- [ ] **90 days no breaking changes** — enforced by branch protection on `main` after rc.1
- [ ] **>99.9% Cloud uptime over 90 days** — measured by the status page above
- [ ] **≥3 enterprise customers running production agents with SSO** — sales / CS milestone
- [ ] **Docs site has full guides + API reference, no "TODO" sections** — CI grep gate
- [ ] **Re-run bench on M3 reference hardware** at rc.1 — commit `bench/baseline-v1.0.0.json` ([#53](https://github.com/Nolpak14/agorio/issues/53))

---

## Risks & mitigations

- **Standards consolidation** (UCP may absorb ACP and AP2). *Mitigation:* Agorio's protocol-abstraction layer means consolidation reduces our work rather than breaking us.
- **Vendor capture** (OpenAI/Google ship "native" SDKs that crowd out independent toolkits). *Mitigation:* stay neutral, support every LLM and every protocol, target builders the big platforms won't serve well (B2B procurement, mid-market retailers, AI startups).
- **EU AI Act enforcement slips**. *Mitigation:* the procurement vertical (v0.7) is valuable regardless of the regulatory deadline.
- **Open-sourcing plugins → losing Stripe revenue.** *Mitigation:* v0.6 Cloud is built before v0.5 relicensing ships in production messaging; Pro tier becomes Cloud-access on day one.

---

## How to contribute

Check [GitHub Issues](https://github.com/Nolpak14/agorio/issues) for tasks labeled `good first issue`. See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup.
