# Security

This document describes the security posture of agorio (the SDK + Cloud) as of v0.8.0.
It is intentionally specific so security reviewers can audit claims rather than infer them.

If you find a vulnerability, **do not open a public issue.** Email security@agorio.dev with
reproduction steps and the affected component. We will acknowledge within 72 hours.

## Scope

| Component       | Surface                                              | Threat model |
| --------------- | ---------------------------------------------------- | ------------ |
| `@agorio/sdk`   | npm-installed library running inside customer code   | Code-level — trust the host process; protect outgoing traffic and merchant interactions |
| `@agorio/plugin-*` | Same — middleware plugins for the SDK            | Same as SDK |
| Agorio Cloud (`cloud.agorio.dev`) | Hosted Next.js app on Vercel       | Web-level — authenticated multi-tenant SaaS |
| `agorio.dev`    | Marketing + Stripe billing                           | Web-level — public + authenticated |

## Authentication & authorization

- **Cloud sessions** — Neon Auth (better-auth-ui), HTTP-only cookies scoped to `.agorio.dev`.
  Cross-subdomain SSO between `agorio.dev` and `cloud.agorio.dev` is intentional.
- **API keys** — format `agorio_sk_<env>_<32 hex>`. Stored as plaintext in Neon Postgres on
  v0.8; **moving to argon2id hashes in v0.9** (tracked: roadmap item, no public issue yet).
  Always sent as `Authorization: Bearer <key>` over TLS. Bearer tokens never logged.
- **Agent identity attestation** — see `AgentAttestation` in `src/security/agent-attestation.ts`.
  Outbound merchant requests carry an HMAC-SHA256 `X-Agorio-Attestation` header binding the
  agentId, timestamp, nonce, method, URL, and body. Replay window is configurable (default 5 min).
  Merchants verify with a shared secret via `verifyAttestation()`.
- **Webhook receivers** (`WebhookServer`) verify `X-Webhook-Signature` (HMAC-SHA256 over the raw body).

## Data handling

- **Trace ingest** (`POST /api/ingest`) — Bearer-auth keys; payloads bounded by Vercel function
  body limits (currently 4.5 MB). Run rows are tenant-scoped and cannot be read across customers.
- **PII redaction** — the SDK does not auto-redact. Customers using the `audit-trail` plugin can
  configure `redact:` patterns; the plugin's tests cover that path.
- **AP2 mandates** — Signed in-process. `verifyMandateShape()` validates structural integrity and
  expiry but does not verify cryptographic signatures (that is the merchant's responsibility, since
  the signing key is theirs).
- **Logs** — Bearer tokens and AP2 signatures are not logged. Cloud trace logs capture the
  `data` field as-is; customers should not place secrets in tool outputs they expect to be
  traced.

## OWASP Top 10 — current posture

| Risk | Status |
| ---- | ------ |
| A01 Broken access control      | Customer-scoped queries on every Cloud route via `getCurrentCustomer()`. Server actions re-check session before mutating. |
| A02 Cryptographic failures     | HMAC-SHA256 on attestation + webhooks. TLS-only via Vercel + Neon. Hashed API keys: roadmap. |
| A03 Injection                  | Drizzle ORM parameterized queries throughout. No raw SQL in Cloud. |
| A04 Insecure design            | Threat model documented above; trusted boundaries spelled out. |
| A05 Security misconfiguration  | Next.js middleware on `/traces`; CSP TBD (tracked). |
| A06 Vulnerable components      | `npm audit` run on every release. Current dev-only advisories (vite) noted below — no runtime exposure. |
| A07 Identification / auth      | Neon Auth handles session + magic-link flows; cookies are `HttpOnly; SameSite=Lax`. |
| A08 Software & data integrity  | Releases tag-gated, published from GitHub Actions; no external publish path. |
| A09 Logging & monitoring       | All ingest paths log structured errors via `console.error`; Cloud logs forwarded to Vercel. |
| A10 SSRF                       | The SDK only fetches URLs the customer passes; no Cloud-side outbound to customer URLs. |

## Dependency posture (2026-05-17)

`npm audit` (root) reports 5 advisories, all transitive through `vitest → vite`:

- vite path-traversal (`GHSA-4w7w-66w2-5vf9`)
- vite `server.fs.deny` bypass (`GHSA-v2wj-q39q-566r`)
- vite dev-server WebSocket arbitrary read (`GHSA-p9ff-h696-f583`)
- two related advisories on the same dep chain

**Runtime impact: none.** Vite is a dev/test-only dependency of `vitest` and never ships in the
published `@agorio/sdk` bundle. The advisories affect Vite's dev server, which agorio never
runs. We bump on each upstream Vitest release.

`@agorio/sdk` runtime dependencies (`@anthropic-ai/sdk`, `@google/generative-ai`, `openai`) are
audited monthly and on every release.

## Secret scanning

Pre-publish CI runs `npx gitleaks detect --no-banner` against the diff. The `.gitleaks.toml`
configuration is permissive on mock keys (`sk_test_*`, `mock_sig_*`) so testing fixtures don't
fail the build.

## Penetration testing

The Cloud dashboard has not yet undergone third-party penetration testing. We plan to engage a
qualified vendor in Q4 2026 ahead of the v1.0 GA. Findings will be published (after remediation)
under `docs/security/pentest-<YYYY-MM>.md`. Internal red-team passes happen each release.

## Reporting a vulnerability

- Email **security@agorio.dev** (PGP key fingerprint TBD)
- Bug bounty: not yet — informal credit in release notes for first-reporter discoveries
- Response SLA: 72 h acknowledgement, 30-day remediation target for high-severity issues
