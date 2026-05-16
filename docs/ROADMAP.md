# Agorio SDK Roadmap

> **Last updated:** 2026-05-16. This roadmap supersedes earlier versions. The pivot from "paid plugins" to "open core + Agorio Cloud" is described in [docs/monetization.md](monetization.md).

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

## Planned

### v0.6.1 — Cloud feature completion + post-launch fixes (Target: Q3 2026, ~3 weeks)

**Goal:** Close out the v0.6 issue's remaining sub-tasks now that the ingestion pipeline and dashboard exist, plus address the issues that surfaced during the v0.6 launch (documented in `docs/v0.6-plan.md` Post-launch patches).

**Originally deferred from v0.6:**

- [ ] **Hosted approval-workflow webhook receiver** — click-to-approve UI for the `approval-workflow` plugin. Requires a new SDK primitive for agent-side approval polling/awaiting (current `approval_workflow` plugin can POST out but the agent can't receive push-backs).
- [ ] **Hosted mock merchants** — wrap `MockMerchant` / `MockAcpMerchant` / `MockMcpMerchant` behind a `cloud.agorio.dev/mock/<tenant-id>/...` route, gated by the same API-key lookup.
- [ ] **Multi-agent fleet view** — org-level rollup with spend / conversion / error rate aggregates. Requires an `orgs` table and a customer→org join.
- [ ] **Stale-run sweeper** — mark `trace_runs` rows still `in_progress` after >1 h as `failure`. Cron job or Vercel scheduled function.
- [ ] **Shared workspace package** — promote `db/` and `lib/auth-server.ts` from the duplicated state to a single source of truth.

**Surfaced during v0.6 launch (need addressing):**

- [ ] **Customer-row-on-first-auth.** Today a `customers` row only exists after Stripe webhook fires on `checkout.session.completed`. Users who sign up via Neon Auth but haven't subscribed see a dead-end "No active subscription" empty state on Cloud. Auto-create a `plan: 'free'` row on first auth so users can explore Cloud (read-only or with a low free quota) before deciding to subscribe.
- [ ] **Stripe webhook upsert-on-email.** The webhook currently INSERTs blindly — if a customer row already exists for the email (e.g., from a manual comp or a re-subscription after cancellation), this creates a duplicate row that the dashboard's `WHERE email = ? LIMIT 1` lookup picks one of at random. Switch to UPSERT keyed on email.
- [ ] **Email uniqueness constraint on customers table.** Currently only `stripe_customer_id` and `stripe_subscription_id` are unique. Adding a UNIQUE constraint on `email` would prevent the duplicate-row class of bug entirely. Requires a migration + handling for the (rare) edge case where someone changes their Stripe email.
- [ ] **Retire `/dashboard#api-keys` on site.** Cloud is now the canonical surface; site's section is kept working for back-compat but should eventually be either removed or replaced with a redirect to Cloud.
- [ ] **Better post-Stripe success page on cloud.** Currently new subscribers see a dead-end "No active subscription" if they land on cloud before the webhook has fired (race condition: success page redirects immediately, webhook can take 1–5s). Add a loading state that polls for the customer row.

### v0.7.0 — B2B Procurement Vertical (Target: Q3/Q4 2026, ~6 weeks)

**Goal:** Ship the killer enterprise reference agent that demonstrates Agorio's value to procurement teams.

- [ ] **Procurement reference agent** — multi-merchant price comparison, approval thresholds, full audit trail, complete purchase flow. End-to-end demo against MockMerchant + WooCommerce + Shopify B2B.
- [ ] **Agent composition primitives** — chain a "find best price" agent → "checkout" agent → "track shipment" agent
- [ ] **Persistent sessions** — resume interrupted shopping flows
- [ ] **Rate limiting & retry** — production-grade HTTP client behavior

### v0.8.0 — Compliance & Hardening (Target: Q4 2026, ~4 weeks)

- [ ] **EU AI Act compliance export module** — PDF/CSV audit-log exports
- [ ] **BotID / agent identity attestation** — integrate Vercel BotID or equivalent
- [ ] **Security audit** — OWASP review, dependency audit, secret scanning
- [ ] **Penetration test** on Cloud dashboard
- [ ] **BigCommerce adapter**

### v1.0.0 — Production GA (Target: H1 2027)

- [ ] Stability + semver guarantees
- [ ] SLA on Agorio Cloud
- [ ] Enterprise SSO (Okta, Azure AD) + RBAC on dashboard
- [ ] Full UCP + ACP + AP2 + MCP protocol coverage
- [ ] Comprehensive docs site (replaces landing page)

---

## Risks & mitigations

- **Standards consolidation** (UCP may absorb ACP and AP2). *Mitigation:* Agorio's protocol-abstraction layer means consolidation reduces our work rather than breaking us.
- **Vendor capture** (OpenAI/Google ship "native" SDKs that crowd out independent toolkits). *Mitigation:* stay neutral, support every LLM and every protocol, target builders the big platforms won't serve well (B2B procurement, mid-market retailers, AI startups).
- **EU AI Act enforcement slips**. *Mitigation:* the procurement vertical (v0.7) is valuable regardless of the regulatory deadline.
- **Open-sourcing plugins → losing Stripe revenue.** *Mitigation:* v0.6 Cloud is built before v0.5 relicensing ships in production messaging; Pro tier becomes Cloud-access on day one.

---

## How to contribute

Check [GitHub Issues](https://github.com/Nolpak14/agorio/issues) for tasks labeled `good first issue`. See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup.
