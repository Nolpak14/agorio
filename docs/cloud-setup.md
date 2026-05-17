# Agorio Cloud — Setup Guide

> **Status:** Agorio Cloud is available as of v0.6.0 (May 2026). Pro tier ($149/yr or $19/mo) unlocks access. Source plan: [docs/v0.6-plan.md](v0.6-plan.md).

## What is Agorio Cloud?

Agorio Cloud is a hosted observability and control plane for `ShoppingAgent` runs. Every span, log, and usage stat your agent emits already flows through the SDK's existing `tracer`, `onLog`, and `AgentResult.usage` primitives — the Cloud helper just ships them to a dashboard at [cloud.agorio.dev](https://cloud.agorio.dev) where you can drill into individual runs.

## What you get

- **Trace explorer.** One row per agent run. Click in to see the tool-call timeline, LLM token counts and costs, latency per step, structured logs, and the final answer or error.
- **API key management.** Create separate keys for `dev`, `prod`, and `test` environments. Revoke individually. Keys are shown exactly once at creation.
- **Tenant isolation.** Every run is scoped to your `customers` row via the API key it was ingested with — you only ever see your own traces.

## Quick start

### 1. Subscribe

If you haven't already, go to [agorio.dev/pricing](https://agorio.dev/pricing) and pick a Pro plan (annual or monthly). Stripe checkout sends you a welcome email with your license key and routes you to `/success`.

### 2. Create an API key

Sign in at [cloud.agorio.dev](https://cloud.agorio.dev) using the same email you used at checkout — sessions are shared across `agorio.dev` and `cloud.agorio.dev`, so if you're already signed in on the site you'll skip the form.

Open the **API keys** tab in the nav (or go directly to [cloud.agorio.dev/api-keys](https://cloud.agorio.dev/api-keys)).

1. Click **+ Create API key**.
2. Give it a label (`local dev`, `CI`, `production agents`, …) and pick an environment (`dev` / `prod` / `test`).
3. Click **Create key**. The dashboard shows the full key once in a yellow reveal card.

> **Copy it now.** The key is never displayed again. If you lose it, revoke and create a new one — revocation is a soft delete that keeps your existing traces' provenance intact.

Keys look like `agorio_sk_prod_a1b2c3d4...` — `agorio_sk_<env>_<32 hex chars>`. The env prefix matches what you selected when creating the key.

> **License key vs. API key.** Your `agorio_pro_…` license key (on [agorio.dev/dashboard](https://agorio.dev/dashboard)) is the billing anchor — Stripe issues one per subscription. API keys (created on Cloud) are what the SDK actually sends to the ingestion endpoint. You can have many API keys per license; they're scoped to your customer record but never used for billing.

### 3. Wire it into your agent

Install or update the SDK:

```bash
npm install @agorio/sdk@^0.6.0
```

Spread the Cloud helper into `AgentOptions`:

```ts
import { ShoppingAgent, agorioCloud, ClaudeAdapter } from '@agorio/sdk';

const cloud = agorioCloud({ apiKey: process.env.AGORIO_API_KEY! });

const agent = new ShoppingAgent({
  llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  ...cloud, // contributes tracer, onLog, onStep, onComplete
});

const result = await agent.run('find me running shoes under $100');
```

That's it. `agorioCloud()` returns a handle with `{ tracer, onLog, onStep, onComplete, beginRun, shutdown }`. Spreading the whole handle wires every primitive at once.

### 4. Watch traces appear

Open [cloud.agorio.dev/traces](https://cloud.agorio.dev/traces). The most recent run appears at the top within a few seconds. Click **View** to drill in.

While a run is `in_progress`, the detail page auto-refreshes every 2 seconds — you can leave it open as your agent runs and watch spans and logs stream in.

## Configuration

```ts
agorioCloud({
  apiKey:          'agorio_sk_prod_…',                       // required
  endpoint:        'https://cloud.agorio.dev/api/ingest',    // optional override
  batchSize:       25,                                       // flush after N buffered events (default 25)
  flushIntervalMs: 1000,                                     // periodic flush in ms (default 1000)
  fetchImpl:       customFetch,                              // optional, for tests
});
```

## Behavior guarantees

- **Network failures never break your agent.** Every `fetch` is wrapped in try/catch; errors only ever produce a `console.warn`.
- **Span timing is automatic.** The helper wraps the SDK's `AgentTracer` interface to record start times in a closure and emit complete `SpanRecord`s with `durationMs` filled in on `.end()`.
- **No data leaves the agent until flush.** Events are buffered in-memory and POSTed in batches with `keepalive: true`. The final batch drains when the agent's run completes via `onComplete`.
- **Trace IDs are client-generated.** `crypto.randomUUID()` produces the run ID before the first event is sent, so the dashboard can stitch streaming data to a single drilldown view.
- **One run = one trace** in v0.6. The wire format keeps `traceId` and `runId` as distinct fields so multi-run traces can be added later without breaking older clients.

## Advanced — escape hatch for non-`run()` callers

If you don't use `ShoppingAgent.run()` / `runStream()` — for example, you've built your own LLM loop — `agorioCloud()` exposes a `beginRun()` escape hatch:

```ts
const cloud = agorioCloud({ apiKey });
const { runId, complete } = cloud.beginRun('custom task description');

// … your custom logic …
// emit spans via cloud.tracer.startSpan(...)
// emit logs via cloud.onLog({ level, message, data, timestamp })

await complete(result, optionalError);
await cloud.shutdown(); // tear down the periodic flush timer
```

## Privacy & data retention

- Traces contain whatever you pass to your agent: the task string, tool call arguments and return values, LLM completion text, and structured log data. **Do not include user-identifying secrets in tool arguments** — they will be persisted in Postgres.
- API keys themselves are stored in plaintext server-side (matching Stripe's API-key model). The Cloud UI only ever displays the first 16 characters after creation (`keyPrefix`). Revocation is immediate (the next ingestion request with a revoked key returns 401, with a worst-case 60-second cache-staleness window).
- Today there is no retention limit — traces persist until you revoke the parent API key. A retention-policy UI is on the v0.7 roadmap.

## Troubleshooting

**My agent ran but no trace appears in the dashboard.**

1. Check the agent process logs for `[agorioCloud]` warnings — network/auth failures are surfaced there.
2. Confirm the API key isn't revoked (check the dashboard).
3. Verify your env var: `process.env.AGORIO_API_KEY` should start with `agorio_sk_<env>_`.
4. Make sure the agent's run actually completed (or that you called `cloud.shutdown()` if you're using `beginRun()`). The final batch flushes on `onComplete`, not eagerly.

**Run shows as `in_progress` forever.**

Your agent process probably crashed or was killed before `onComplete` fired. The Cloud doesn't yet auto-mark stale runs as `failure` — a sweeper is on the v0.6.1 roadmap. You can safely ignore these rows.

**`401 Unauthorized` from `/api/ingest`.**

Either the key is malformed, revoked, or you're hitting a stale cache entry. Cache TTL is 60 seconds, so wait a minute after rotating keys.

**I'm signed in on `agorio.dev` but `cloud.agorio.dev` still asks me to sign in.**

Cookies are scoped to `.agorio.dev` in production — they should work across both. If they don't:
- Try a hard reload on `cloud.agorio.dev`. Some browsers cache the auth state of redirect targets aggressively.
- Confirm you don't have a browser extension stripping cross-subdomain cookies.
- If you signed up using a different email than your Stripe subscription's email, the lookup won't find a customer record. Sign out and use the email that matches your Pro subscription.

**`cloud.agorio.dev/traces` shows "No active subscription" but I subscribed.**

The customer record is keyed on the email used at Stripe checkout. If you signed in with a different email (sometimes auth providers normalize differently), `cloud` can't match you to a `customers` row. Either sign out and re-sign-in with the Stripe email, or contact support to merge the accounts.

## What's coming in v0.6.1

- Hosted approval-workflow webhook receiver — click-to-approve UI for high-value transactions
- Hosted mock UCP/ACP/MCP merchants — drop them into your CI without spinning up local servers
- Fleet view — org-level aggregates across all your agents
- Stale-run sweeper

See [docs/ROADMAP.md](ROADMAP.md) for the full plan.
