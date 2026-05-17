# 0003 — Schema duplication between `site/` and `cloud/`

**Date:** 2026-04-12
**Status:** Accepted — revisit at v1.x

## Context

The marketing/billing app (`site/`) and the trace explorer (`cloud/`) are deployed as separate
Vercel projects, each with their own `drizzle-orm` dependency. They share a Neon Postgres
database. Drizzle schema imports must resolve against a single copy of the orm — re-exporting
through a workspace package gave us module-resolution headaches in both Turbo and pnpm setups.

## Decision

Duplicate the schema file in both apps with a **`KEEP IN SYNC WITH …` header** at the top of each
copy. Migrations are owned by `site/db/schema.ts` (single `drizzle-kit push`).

## Consequences

- Two files for one schema. Reviewers must check both diffs.
- The friction has caught two near-misses already; the header pulls attention to the dependency.
- We revisit this when we can adopt a workspaces-only deploy (likely v1.x with the self-hosted
  Docker compose, which already shares a single image).

## Mitigations

- Pre-commit hook checks that the two files are byte-identical from a marked region forward.
  (Not yet shipped — open as a follow-up.)
- The `cloud.test.ts` smoke test catches schema drift at the type level.
