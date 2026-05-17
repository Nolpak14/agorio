# Changelog

All notable changes to `@agorio/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.8.0] — Unreleased — Compliance & Hardening

EU AI Act enforcement begins **2 August 2026**. This release ships the compliance artifacts and security hardening enterprise buyers require. See [`docs/v0.8-plan.md`](docs/v0.8-plan.md) and tracks [issue #38](https://github.com/Nolpak14/agorio/issues/38).

### Added

- **BigCommerce adapter** (`src/adapters/bigcommerce.ts`) — third real-merchant proof point with feature parity to Shopify/WooCommerce: catalog listing/search/get, cart creation, checkout completion, order status lookup. Auto-detects canonical `store-<hash>.mybigcommerce.com` domains. Exports `BigCommerceAdapter`, `BigCommerceAdapterError`, `BigCommerceAdapterOptions`, `isBigCommerceStore`.
- **`AgentAttestation`** (`src/security/agent-attestation.ts`) — cryptographic proof that an outgoing request came from an authorized agent. Default scheme is HMAC-SHA256 over a canonical envelope (`agentId\ntimestamp\nnonce\nmethod\nurl\nsha256(body)`). `X-Agorio-Attestation` header. `wrapFetch()` automatically attaches the header to outgoing requests; `verifyAttestation()` validates inbound headers with a customer-supplied secret resolver. Pluggable `sign:` function for ed25519 / WebAuthn / KMS-backed schemes.
- **`verifyMandateShape()`** AP2 receiver helper (`src/client/ap2-client.ts`) — structural sanity check on inbound `SignedMandate`s. Validates required fields, expiry, and (for `CartMandate`) line-item integrity. Does not verify cryptographic signatures — that's the merchant's responsibility.
- **EU AI Act compliance export** — new `GET /api/compliance/export` endpoint on Cloud. CSV or JSON, date-range parameter (capped at 90 days), `runs/spans/logs` selectable, output stamped with `X-Agorio-Export-Spec: EU-AI-Act-Annex-IV-v1`. New `/compliance` dashboard page with a form for one-click downloads.
- **Cloud audit log** — new `cloud_audit_log` table records every state-changing dashboard action (`api_key.create`, `api_key.revoke`, `compliance.export`). New `/audit-log` page surfaces the last 200 entries for the authenticated customer.
- **RBAC schema** — new `orgs` + `org_members` tables (with `org_role` enum: `owner | admin | member | viewer`). Migration only in v0.8; full role-gating in v1.0.
- **`docs/security.md`** — OWASP top-10 posture, dependency advisories, secret-scanning configuration, vulnerability disclosure policy.
- **`docs/compliance.md`** — EU AI Act, GDPR, PCI DSS, SOC 2, HIPAA, ISO 27001 stances. Data-residency notes.
- **Bench harness** (`bench/run.ts` + `bench/README.md`) — reproducible micro-benchmarks for agent latency and SDK overhead. Stub LLM keeps results provider-independent. Baseline numbers committed at `bench/baseline-v0.8.0.json`.

### Changed

- **AP2 client promoted to GA.** `Ap2Client` is no longer "experimental"; header comment and CHANGELOG language updated.
- **`AgentOptions.experimental_ap2` deprecated** in favor of `AgentOptions.ap2`. Both flags are honored through v0.x; the old name is removed in v1.0 per the deprecation policy.

### Tests

- +20 BigCommerce adapter tests
- +16 `AgentAttestation` tests (sign, parse, wrapFetch, verify happy + tampered + skew + malformed)
- +5 `verifyMandateShape` tests on the AP2 client

Total: **403** tests (387 root + 12 procurement + 4 session-redis).

---

## [0.7.0] — Unreleased — B2B Procurement Vertical

The headline B2B demo plus the primitives that make it non-trivial to clone. See [`docs/v0.7-plan.md`](docs/v0.7-plan.md) for the full plan and tracks [issue #37](https://github.com/Nolpak14/agorio/issues/37).

### Added

- **`AgentChain` + sub-agent primitive** (`src/agent/sub-agent.ts`, `src/agent/agent-chain.ts`) — compose specialized agents (find-best-price → checkout → track-shipment) with first-class Cloud span hierarchy via injected `parent_span_id` + `sub_agent_name` attributes. Recursion guard at depth 3.
- **`invoke_sub_agent` tool** auto-registered on `ShoppingAgent` when `subAgents` is configured.
- **`SessionStorage` interface** (`src/types/index.ts`) + `MemorySessionStorage` and `FileSessionStorage` in-tree (`src/session/`). New `sessionStorage`, `sessionId`, `sessionCustomerId` options on `AgentOptions`. Agents save state after every iteration; constructing a new agent with the same `sessionId` resumes from the persisted snapshot.
- **Plugin `hydrate?(state)` hook** on `EnterprisePlugin` (paired with the existing `getState?()`). The `approval-workflow` plugin uses it to survive process restarts mid-approval-wait.
- **`@agorio/session-redis@0.1.0`** new separate npm package — `RedisSessionStorage` with TTL support and customer secondary index. Production answer for durable agent sessions.
- **`@agorio/plugin-procurement@0.1.0`** new npm package — PO# generation (sequential / uuid / custom), vendor lookup, expense categorization, `requirePoOnCheckout` enforcement, `procurement_completed` audit event.
- **HTTP primitives** (`src/http/`) — `createHttpClient({ retry?, rateLimit? })` factory, `withRetry` exponential backoff with `Retry-After` support, `TokenBucket` + `withRateLimit` per-origin throttling. Drop into any adapter's existing `fetch:` option.
- **Cloud trace explorer** — sub-agent strip showing each invocation's depth + duration, indented spans tree based on `attributes.depth` / `parent_span_id`.
- **`examples/procurement/`** — reference agent + CI smoke test running the 3-step chain against three MockMerchants. Documents WooCommerce docker-compose and Shopify dev store setup for the full-demo mode.
- **Marketing surface** — new `agorio.dev/procurement` landing page with feature grid + full code sample. README "New in v0.7" section near the top.

### Changed

- `ShoppingAgent.run()` now calls `tryHydrate()` at start and `persistSession()` after each iteration when `sessionStorage` + `sessionId` are configured. No behavior change when the options are absent.
- `ShoppingAgent` constructor accepts `subAgents`, `subAgentMaxDepth`, `sessionStorage`, `sessionId`, `sessionCustomerId` (all optional, backward-compatible).
- `src/http/rate-limit.ts` uses `Parameters<typeof globalThis.fetch>[0]` instead of `RequestInfo` for portability across tsconfig lib settings.

### Tests

- +15 HTTP primitive tests (`http-retry`, `http-rate-limit`)
- +11 sub-agent + chain tests (`sub-agent`, `agent-chain`)
- +13 session-storage tests (memory + file storages + ShoppingAgent resume integration)
- +4 RedisSessionStorage tests (separate package)
- +12 procurement plugin tests (separate package)
- +1 procurement example smoke test
- **Total SDK suite: 362 passing across 29 files** (was 306/18 at v0.6).

---

## [0.6.0-infra] — 2026-05-16 — Cloud infrastructure patches (no SDK version bump)

After `@agorio/sdk@0.6.0` shipped to npm, a series of post-launch patches landed on the site and cloud apps to fix the auth flow, polish the visual design, and migrate API-key management onto Cloud where it belongs. No SDK code changed — this is purely site / cloud infrastructure.

### Auth flow

- **Dynamic `/auth/[pathname]` route** added to both `site/` and `cloud/` (replaces the original single-view `/login` page). One route handles sign-in, sign-up, forgot-password, reset-password, verify-email, callback. The original `/login` route now redirects to `/auth/sign-in` for backward-compat.
- **`NeonAuthUIProvider` wired into cloud/** — the missing provider was why cloud's login page initially rendered blank. Both `site/components/Providers.tsx` and the new `cloud/components/Providers.tsx` thread `useRouter().push/replace` + Next.js `Link` through the provider for client-side navigation, and force `defaultTheme="dark"`.
- **Cross-subdomain session sharing** — `cookies.domain: '.agorio.dev'` added to both `auth-server.ts` files (gated on `VERCEL_ENV === 'production'` so localhost / `*.vercel.app` previews keep working). Sessions persist across `agorio.dev` ↔ `cloud.agorio.dev`. **One-time Neon Console action required**: add the new subdomain to the project's "Trusted domains" list in the Neon Auth dashboard (documented in `docs/v0.6-release-checklist.md`).
- **`html.dark` set server-side** in both root layouts to prevent dark-mode FOUC before the theme script hydrates.

### Brand-native auth visuals ("Terminal-Native Authentication")

- **shadcn theme tokens mapped to Agorio brand** in both `globals.css` files. Overrides better-auth-ui's internal `--neon-*` tokens directly (rather than the shadcn `--card` / `--primary` aliases, which would collide with this project's existing brand variables of the same name).
- **Terminal-frame card design** — wrap `<AuthView>` in the same macOS-style window aesthetic the homepage code blocks use (red/yellow/green dots + monospaced filename like `~/agorio/auth/sign-in.ts` on site or `cloud.agorio.dev/auth/sign-in` on cloud).
- **Per-element `classNames` overrides** on `<AuthView>` for the primary button (cyan→teal gradient), inputs (code-bg surface with cyan focus ring), labels (uppercase JetBrains Mono tracking-wider), title, footer link.
- **Subtle ambient glow** behind the card via radial gradient, JetBrains Mono wordmark + prompt-style tagline above, status-dot footer with GitHub / Pricing links.

### API-key management migrated to Cloud

The v0.6.0 plan put API keys under `site/app/dashboard#api-keys`, which created a confusing cross-domain UX hop for Cloud users (the keys are *used* by the Cloud SDK helper). Built `cloud/app/api-keys/{page.tsx,actions.ts,CreateApiKeyForm.tsx}` mirroring site's UX. CloudNavbar now links `API keys` in-app, with a separate muted "Billing ↗" link out to `agorio.dev/dashboard` for license-key / Stripe portal management. The `/traces` empty state was rewritten as a numbered 3-step quickstart with a direct `/api-keys` CTA. Onboarding success page now lands new subscribers on `cloud.agorio.dev/api-keys`.

Site's `/dashboard#api-keys` section is intentionally retained as a working secondary surface for back-compat. It's no longer canonical.

### Site/cloud navbar

- **`<SignedIn>` / `<SignedOut>` wrappers** in both navbars conditionally render Sign in / Sign up CTAs vs the UserButton + dashboard link.
- Site navbar adds an explicit "Sign in" + "Sign up" button when signed out (previously only an invisible `<UserButton />`).
- Cloud navbar links: Traces · API keys · Billing ↗ (cross-domain) · UserButton.

### Fixed

- **Middleware over-matching broke server actions.** Cloud's middleware initially had `matcher: ['/traces/:path*', '/api-keys', '/api-keys/:path*']`. Next.js 15 sends action POSTs to the page route, and the Neon Auth middleware's response augmentation made the client see "An unexpected response was received from the server" when creating a key. Removed `/api-keys` from the matcher; final state: `['/traces/:path*']` only.
- **Env-var corruption during bulk-copy.** When initially provisioning cloud's env vars, a `vercel env pull` → `vercel env add` round-trip left literal `\n` (two characters) appended to `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_COOKIE_SECRET`. The SDK proxy then built URLs like `…/auth\n/sign-in/email` and got 404 from Neon. Fixed by re-setting from clean source. Documented in the release checklist so the next sibling-app setup doesn't repeat it.

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
