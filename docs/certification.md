# Agorio Compatible certification

The Agorio Compatible program recognizes merchants whose storefronts work cleanly with
`@agorio/sdk` agents. It's a marketing-grade badge — useful for merchants that want to signal
"AI agents work here" to procurement buyers.

## Levels

### Compatible

Your storefront either:

- Implements UCP discovery (`/.well-known/ucp`) and the discovered services pass our smoke test
  suite, or
- Has a `MerchantAdapter` implementation in this repo's `src/adapters/` or in the
  [adapters registry](./adapters-registry.md).

This is the entry-level badge. Most certified storefronts will sit here.

### Compatible + AP2

You meet the **Compatible** bar and additionally:

- Accept AP2 SignedMandates at a documented payment endpoint
- Pass `verifyMandateShape()` on inbound mandates
- Honor the mandate `expiresAt` field

This is a meaningful proof point for procurement use cases where the buyer's signing key
proves authorization.

### Compatible + Attested

You meet the **Compatible** bar and additionally:

- Verify the `X-Agorio-Attestation` header on inbound agent requests via `verifyAttestation()`
- Reject requests with malformed, expired, or mismatched signatures
- Document the per-agent secret rotation policy

This is the strongest level — it means agent identity is cryptographically verified end-to-end.

## How to apply

There is no formal application yet. Open an issue in this repo tagged `certification` with:

- Your storefront URL
- The level you're claiming
- Test results (we'll publish a CI-runnable check script alongside v1.0)

We'll review within two weeks and merge a PR adding you to the certified list in
[adapters-registry.md](./adapters-registry.md).

## Revocation

Certifications can be revoked if:

- The storefront stops responding to the published API
- A reported compatibility issue isn't resolved within 30 days
- The merchant requests removal

Revocations are listed transparently in the registry's history.
