# 0006 — Agent identity attestation via HMAC, not mTLS

**Date:** 2026-05-17
**Status:** Accepted

## Context

EU AI Act buyers want a cryptographic proof that "this checkout request really came from an
authorized agent X." The candidates:

1. **mTLS** — strongest, but requires merchant-side certificate provisioning, and Fluid Compute
   regions complicate certificate pinning.
2. **OAuth client_credentials** — well-understood, but adds a token round-trip per agent
   session and requires the merchant to run an auth server.
3. **HMAC-signed request envelope** — symmetric secret per (agent, merchant) pair; signature in
   a single header per request.

## Decision

Ship HMAC-SHA256 as the default in v0.8 via `AgentAttestation` in `src/security/`. Header format:

```
X-Agorio-Attestation: v=1; agent=<agentId>; ts=<unix>; nonce=<hex>; sig=<hex>
```

Allow customers to swap in a custom `sign:` function for ed25519 / WebAuthn / KMS-backed
schemes. Ship a `verifyAttestation()` helper for merchants.

## Consequences

- Zero infrastructure to deploy. Works on Fluid Compute, Edge, and Node.
- Symmetric key has to be shared with each merchant. We document this as the trade-off.
- Replay protection comes from the nonce + 5-minute skew window, not from a server-side nonce
  cache. Merchants who need stronger replay protection should add their own nonce store.
- We can graduate to asymmetric signing without breaking the header format — `sig=` accepts any
  hex string; the algorithm is inferred from `keyId` lookup on the verifier side.
