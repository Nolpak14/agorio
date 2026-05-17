# 0001 — Why Open Core + hosted Cloud

**Date:** 2026-05-15
**Status:** Accepted (foundational)

## Context

We launched v0.4 as a freemium model: SDK MIT, 5 enterprise plugins under a custom proprietary
license, Stripe-gated activation. The plugins were technically the value driver for procurement
buyers, but the license model created two persistent frictions: (1) every new plugin needed a
license-check code path the SDK had to import, and (2) buyers stalled because legal couldn't
approve the bespoke license.

## Decision

Pivot to **Open Core**:

- All five plugins (later: six, with the v0.7 procurement plugin) relicense to MIT and publish
  to npm under `@agorio/plugin-*`.
- Monetization moves to a hosted product surface — **Agorio Cloud** at `cloud.agorio.dev`.
  Trace observability, approval webhooks, mock-merchant endpoints, and (in v0.8+) compliance
  exports are the things customers pay for.

## Consequences

- Plugins gain organic install rates (npm downloads as a marketing signal).
- The SDK becomes simpler — no license-key middleware in the core path.
- Revenue concentrates on Cloud, which is harder to fork but easier to differentiate (UX,
  retention, integrations).
- We commit to running a public service with SLA implications — see [0007](0007-semver-v1.md).
