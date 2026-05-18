# Agorio Analytics Tracking Plan

> **Single source of truth for every event Agorio captures in PostHog.**
> Updated when an event is added, renamed, deprecated, or has its properties
> changed. The corresponding `posthog.capture()` / `posthog.identify()` call
> in code must match this document exactly — if it doesn't, this document
> wins and the code is the bug.
>
> **Owner:** founder. **Audit cadence:** monthly (first Monday) per
> `docs/gtm-playbook.md` section 11.
> **PostHog org/project:** existing org → project `agorio` (EU cloud,
> `https://eu.i.posthog.com`).

---

## 1. Identity contract

### 1.1 `distinctId`

We use the user's **email** as `distinctId` across both `agorio.dev` (site)
and `cloud.agorio.dev` (cloud). Email is the only stable identifier we
control before subscription and the same identifier the Stripe customer
record + Neon Auth session both expose. Anonymous visitors keep their
PostHog-generated cookie ID until the first `identify()` call merges them.

### 1.2 Person properties set at identify

Every `posthog.identify()` call sets the following person properties:

| Property | Source | Notes |
|---|---|---|
| `email` | Neon Auth session | Mirror of distinctId for filter convenience |
| `plan` | `customers.plan` (or `'free'`) | One of `free` \| `pro` \| `enterprise` |
| `subscription_status` | `customers.status` | Only set when present; one of `active` \| `past_due` \| `suspended` \| `cancelled` |

Cloud-side identify additionally sets (once the org/role wiring lands —
phase 2):

| Property | Source | Notes |
|---|---|---|
| `org_id` | `cloud/lib/rbac.ts` | RBAC org for the current customer |
| `role` | `cloud/lib/rbac.ts` | One of `owner` \| `admin` \| `member` \| `viewer` |

### 1.3 Super-properties (set once per session)

Captured via middleware on first hit and attached to every subsequent
event in the same session:

| Property | Source | Notes |
|---|---|---|
| `utm_source` | URL query | Persisted only on initial hit |
| `utm_medium` | URL query |  |
| `utm_campaign` | URL query |  |
| `referrer_domain` | Document referrer | First-touch only |

UTM wiring is **phase 2** — not yet implemented; see section 6.

---

## 2. Event catalog (foundation)

These are the events the GTM playbook depends on. **Foundation status**
indicates whether the capture call is wired today. The contract is
canonical regardless — code that doesn't conform to the contract is the
bug.

### 2.1 Auto-captured events (PostHog defaults)

PostHog autocapture is **on**. These fire without code changes:

| Event | What it captures | Notes |
|---|---|---|
| `$pageview` | Manual capture in `components/PostHogPageView.tsx` on every App Router navigation | We disabled PostHog's built-in `capture_pageview` because it misses App Router transitions; the component handles all routes |
| `$pageleave` | Built-in | Useful for time-on-page calculations |
| `$autocapture` | All clicks, form submissions, inputs (masked) | Provides default funnels without per-CTA instrumentation |
| `$identify` | Side effect of `posthog.identify()` | Merges anonymous → identified |
| `$exception` | Unhandled errors (we set `capture_exceptions: true`) | Surfaced in PostHog error tracking |

### 2.2 Custom events — explicit `posthog.capture()` calls

| # | Event | Fired where (app · path) | Properties | Wired |
|---|---|---|---|---|
| 1 | `cta_click` | Any CTA button on `site/` | `cta_id` (string), `location` (page path), `plan_target` (optional, when CTA targets a tier) | ⏳ phase 2 |
| 2 | `pricing_tier_viewed` | `site/app/pricing/page.tsx` — viewport-enter on each tier card | `tier` (`free` \| `pro` \| `enterprise`) | ⏳ phase 2 |
| 3 | `signup_started` | `site/app/auth/[pathname]/page.tsx` when `pathname === 'sign-up'` | `source` (utm_source if present) | ⏳ phase 2 |
| 4 | `signup_completed` | Server-side: Neon Auth callback in `site/app/auth/[pathname]/page.tsx` post-callback, before redirect | `customer_id` (email at this stage) | ⏳ phase 2 |
| 5 | `checkout_started` | `site/app/api/create-checkout-session/route.ts` — server-side capture via `posthog-node` after Stripe session created | `price_id`, `plan` (`pro_annual` \| `pro_monthly`), `customer_id` | ⏳ phase 2 |
| 6 | `subscription_created` | `site/app/api/webhooks/stripe/route.ts` — on `checkout.session.completed` | `plan`, `mrr` (number, monthly USD equivalent), `customer_id` | ⏳ phase 2 |
| 7 | `api_key_created` | `cloud/app/api-keys/actions.ts` server action — on successful insert | `env` (`dev` \| `prod` \| `test`), `customer_id` | ⏳ phase 2 |
| 8 | `first_trace_received` | `cloud/app/api/ingest/route.ts` — server-side, only the first call per customer (check `trace_runs` for prior rows) | `customer_id`, `agent_kind` (optional, from request body) | ⏳ phase 2 |
| 9 | `playground_run` | `site/app/playground/page.tsx` — on submit | `provider` (`gemini` \| `claude` \| `openai`), `merchant_kind` (`ucp` \| `acp` \| `mock`) | ⏳ phase 2 |
| 10 | `procurement_demo_cta` | `site/app/procurement/page.tsx` — CTA click | `intent` (`eval` \| `demo` \| `design-partner`) | ⏳ phase 2 |

**Foundation status as of 2026-05-18:** PostHog SDK is initialized in both
apps with autocapture, pageview tracking, and identify-on-session. None of
the events above are wired yet — that's phase 2, instrumented file-by-file.

---

## 3. Conversion events (mark in GA4 + PostHog)

These are the events the GTM playbook treats as conversions. Mark them as
conversions in GA4 and as funnel-step events in PostHog dashboards. The
property-key match between GA4 and PostHog matters — keep them identical.

| Event | GA4 conversion? | PostHog dashboard | Notes |
|---|---|---|---|
| `cta_click` where `cta_id = pricing_pro` | yes | Acquisition | Pricing → Stripe top-of-funnel |
| `cta_click` where `cta_id = procurement_design_partner` | yes | Acquisition | Procurement lead intent |
| `signup_started` | yes | Acquisition | Top of activation funnel |
| `signup_completed` | yes | Acquisition + Cloud activation | The most important conversion |
| `subscription_created` | yes | Acquisition | Revenue event |
| `api_key_created` | yes | Cloud activation | Step before first trace |
| `first_trace_received` | yes | Cloud activation | Activation milestone |
| `playground_run` | yes | Acquisition | Engagement signal |

---

## 4. Feature flags

Provisioned now (default OFF) so phase 2 work can flip them without a
re-deploy:

| Flag | Type | Use case |
|---|---|---|
| `pro_pricing_v2` | Boolean | A/B test of pricing-page hero (phase 3) |
| `procurement_lead_form_v2` | Boolean | Test variant of `/procurement` lead form |

---

## 5. Session replay policy

| Surface | Replay enabled | Why |
|---|---|---|
| `agorio.dev` marketing pages | ❌ Off (foundation default) | Low signal, noisy from bot traffic |
| `agorio.dev/playground` | ❌ Off | LLM prompts can contain PII |
| `cloud.agorio.dev` | ✅ On with `maskAllInputs: true` | First-trace activation is the gold path; replays are the fastest debug surface for stuck users |

The cloud-side `Providers.tsx` enables `session_recording: { maskAllInputs: true }`.
Marketing-site replays stay off via the absence of the option (site
Providers does not pass `session_recording`).

---

## 6. Wiring status & next steps

**Foundation shipped (2026-05-18):**
- `posthog-js` installed in `site/` and `cloud/`.
- `PostHogProvider` wired in both `Providers.tsx`; SDK initialized with
  EU cloud reverse proxy via `/ingest`.
- App Router pageview tracking via `components/PostHogPageView.tsx`.
- Server-side identify pattern via `components/PostHogIdentify.tsx` +
  `PostHogIdentifyClient.tsx`. Wired in both root layouts.
- `cloud/app/layout.tsx` carries `robots: { index: false, follow: false }`.
- `next.config.ts` rewrites configured for `/ingest/*` → `eu.i.posthog.com`.
- Env vars: `NEXT_PUBLIC_POSTHOG_KEY` (live, set in `site/.env.local`) and
  `NEXT_PUBLIC_POSTHOG_UI_HOST`. Cloud needs the same vars added to its
  `.env.local` (template in `cloud/.env.example`).

**Phase 2 work (separate sessions, file-by-file):**
1. Wire each custom event in section 2.2 — start with `signup_started` and
   `signup_completed` (highest funnel value), then `cta_click` on the
   pricing tier buttons, then the Cloud-side activation events.
2. Add UTM-capture middleware in both apps; persist as PostHog
   super-properties.
3. Create the two PostHog dashboards: `Agorio — Acquisition` and
   `Agorio — Cloud activation`.
4. Provision the two feature flags.
5. Add cloud-side `org_id` + `role` to the identify properties once RBAC
   integration is exercised by real users.

**Vercel deployment:**
The PostHog env vars need to be added to both Vercel projects' Production
and Preview envs:
- `agorio-site` project: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_UI_HOST`
- `agorio-cloud` project: same two vars

Use `vercel env add NEXT_PUBLIC_POSTHOG_KEY production` (and `preview`) for
each, then redeploy. Confirm `Realtime` in the PostHog dashboard shows
traffic from both subdomains within 60 seconds of deploy.

---

## 7. Verification

After deploy:

1. Open `https://agorio.dev` in a fresh incognito window.
2. Open PostHog → Project `agorio` → **Activity** (live events).
3. Within 2 seconds you should see a `$pageview` from your distinct ID
   with `$current_url` = `https://agorio.dev/`.
4. Navigate to `/pricing`. A second `$pageview` should appear.
5. Click any link. An `$autocapture` event should appear.
6. Sign in. A `$identify` event should appear, merging your anonymous
   distinct ID into your email. The next `$pageview` should show
   `email`, `plan`, and `subscription_status` person properties.
7. Repeat steps 1-6 on `https://cloud.agorio.dev` (signed-in only;
   anonymous routes redirect to sign-in).
8. Confirm `curl -I https://cloud.agorio.dev` returns
   `X-Robots-Tag: noindex` (set via root layout `robots` metadata).

If any of the above fails, check (in order):
1. Browser console for PostHog init errors.
2. Network tab for `/ingest/*` requests — should be 200, not blocked.
3. `NEXT_PUBLIC_POSTHOG_KEY` is set in Vercel env for the relevant project.
4. Reverse proxy rewrites in `next.config.ts` resolved correctly.
