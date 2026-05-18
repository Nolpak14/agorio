# Versioning policy

`@agorio/sdk` follows [Semantic Versioning 2.0.0](https://semver.org/) starting at **v1.0.0**.
Until v1.0.0 every minor bump may include breaking changes; this document describes the policy
that takes effect once v1.0 ships.

## Promises

For all releases on the v1 major line:

- **MAJOR** (`2.0.0`) — May break the public API. We will not ship one without at least a
  one-minor-version deprecation runway and a migration guide.
- **MINOR** (`1.x.0`) — Additive only. New exports, new optional parameters, new plugin lifecycle
  hooks. Existing types and signatures remain backwards compatible.
- **PATCH** (`1.x.y`) — Bug fixes and documentation. No new exports.

## What "public API" covers

The promises above apply to anything imported from the top-level package or any documented
subpath export:

```ts
import { ... } from '@agorio/sdk';
import { ... } from '@agorio/sdk/mock';
import { ... } from '@agorio/sdk/cloud';
```

Plus the published plugin packages:

- `@agorio/plugin-spending-controls`
- `@agorio/plugin-approval-workflow`
- `@agorio/plugin-audit-trail`
- `@agorio/plugin-agent-identity`
- `@agorio/plugin-policy-engine`
- `@agorio/plugin-procurement`

And the optional storage package:

- `@agorio/session-redis`

The promises **do not** cover:

- Anything imported through deep paths (`@agorio/sdk/dist/...`) — those are internals.
- Mock fixtures and test helpers — `DEFAULT_PRODUCTS` may change shape in any release.
- Wire-format details of `agorioCloud()` ingestion — that's a private contract between the SDK
  and `cloud.agorio.dev`, and both sides version-lock to a compatible pair.

## Deprecation policy

A symbol marked `@deprecated` in TSDoc will:

1. Remain functional for at least one minor version on the current major.
2. Log a one-time `console.warn` the first time it is used in a process.
3. Be removed only in the next major bump.

Example: `experimental_ap2` was deprecated in v0.8 in favor of `ap2` and removed in v0.9 — the
mandatory one-minor-version runway between deprecation and removal that this policy requires.

## LTS lines

There is no formal LTS yet. The most recent v1 minor receives bug fixes; older minors are
patched only for high-severity security issues.

## Node.js support

Minimum supported Node.js version moves only on a major bump. v1.0.0 requires Node 20+.
