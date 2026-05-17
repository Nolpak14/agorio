# 0007 — Versioning policy and v1.0 stability commitment

**Date:** 2026-05-17
**Status:** Accepted — supersedes the implicit 0.x policy

## Context

The v0.x line shipped breaking changes on minor bumps when the design called for it (e.g. v0.4
restructured the plugin API). That was fine while the API was being discovered. By v0.8 the
public surface is stable enough that enterprise procurement teams are blocking on a 1.0
commitment to budget multi-year deployments.

## Decision

Adopt full [SemVer 2.0.0](https://semver.org/) starting at v1.0.0 (H1 2027). The detailed
policy is in [docs/semver.md](../semver.md). Headline:

- v1.x is additive-only for the minor channel.
- A symbol can only be removed in a major bump and must have been `@deprecated` for at least one
  prior minor.
- Node 20+ is the v1.0 minimum; the floor moves only on a major.

## Consequences

- We accept that some refactors are now postponed to v2.0.
- The benefit is that v1.x customers can lock to `^1.0.0` and accept patch + minor upgrades
  without integration risk.
- v0.x → v1.0 is itself a major bump with a migration guide
  ([docs/migration-0.x-to-1.0.md](../migration-0.x-to-1.0.md)).
