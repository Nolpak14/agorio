# Agorio Documentation

> **Quick links:** [ROADMAP](./ROADMAP.md) · [Migration guide (0.x → 1.0)](./releases/migration-0.x-to-1.0.md) · [Versioning policy](./semver.md) · [Plugin development guide](./guides/plugin-development.md)

This is the documentation index for the Agorio repository. The on-the-ground source of truth is always the code; these docs explain the **why** and the **how** behind it.

If you are looking for the website + cloud product docs, those live at `agorio.dev` (and at `agorio.dev/docs` once the Nextra docs site ships in v0.10 — tracked in [#59](https://github.com/Nolpak14/agorio/issues/59)).

## Layout

```
docs/
  README.md                  # this file
  ROADMAP.md                 # shipped + planned releases
  semver.md                  # versioning policy
  security.md                # OWASP / dependency / vuln-disclosure posture
  compliance.md              # EU AI Act / GDPR / PCI / SOC 2 / ISO 27001 posture
  adapters-registry.md       # community + first-party storefront adapters
  plugins-registry.md        # community + first-party plugins
  certification.md           # community plugin / adapter certification program

  adr/                       # architecture decision records (0001-0007 + more)
  releases/                  # per-release plans + migration + checklist
  guides/                    # developer how-tos (SDK + cloud)
```

## Where to find things

### High-traffic entry points
- **[`ROADMAP.md`](./ROADMAP.md)** — every shipped release with summary + every planned release.
- **[`releases/migration-0.x-to-1.0.md`](./releases/migration-0.x-to-1.0.md)** — one-line edits to upgrade past breaking changes on the road to v1.0.
- **[`semver.md`](./semver.md)** — versioning policy (when breaking changes are allowed, deprecation rhythm, v1.0 contract).

### Release plans (`releases/`)
Detailed planning + retrospective per release. Each `v0.X-plan.md` is the planning doc; checklists and migration guides sit alongside.
- [`v0.4-plan.md`](./releases/v0.4-plan.md) · [`v0.5-plan.md`](./releases/v0.5-plan.md) · [`v0.6-plan.md`](./releases/v0.6-plan.md) · [`v0.6-release-checklist.md`](./releases/v0.6-release-checklist.md) · [`v0.7-plan.md`](./releases/v0.7-plan.md) · [`v0.8-plan.md`](./releases/v0.8-plan.md) · [`v1.0-plan.md`](./releases/v1.0-plan.md)
- [`migration-0.x-to-1.0.md`](./releases/migration-0.x-to-1.0.md)

### Architecture decision records (`adr/`)
Why we built it the way we built it. Read in order.
- See [`adr/README.md`](./adr/README.md) for the index. ADRs 0001-0007 cover Open Core pivot, quad-protocol coverage, schema duplication, composable HTTP, sub-agent primitives, attestation HMAC, and the v1.0 semver contract.

### Developer guides (`guides/`)
Step-by-step how-tos for SDK users and community contributors.
- **[`plugin-development.md`](./guides/plugin-development.md)** — `AgentPlugin` vs `EnterprisePlugin`, all lifecycle hooks, complete worked example, publishing under `@agorio/plugin-*`.
- **[`adapter-sdk.md`](./guides/adapter-sdk.md)** — building a custom merchant adapter (Shopify/Woo/BC pattern).
- **[`community-plugins.md`](./guides/community-plugins.md)** — how to publish a community plugin and get it listed in the registry.
- **[`reference-agents.md`](./guides/reference-agents.md)** — production-grade agent templates (consumer, procurement, expense, retailer-owned).
- **[`cloud-setup.md`](./guides/cloud-setup.md)** — user-facing guide for spinning up Agorio Cloud.
- **[`self-hosted.md`](./guides/self-hosted.md)** — Docker Compose + Helm path for running Cloud on your own infra.
- **[`tracking-plan.md`](./guides/tracking-plan.md)** — canonical PostHog event + identity contract for both `site/` and `cloud/`. The code conforms to this doc, never the reverse.

### Registries
- **[`adapters-registry.md`](./adapters-registry.md)** — community + first-party merchant adapters.
- **[`plugins-registry.md`](./plugins-registry.md)** — community + first-party plugins.
- **[`certification.md`](./certification.md)** — review program for inclusion in either registry.

### Posture documents
- **[`security.md`](./security.md)** — OWASP top-10 posture, dependency advisories, secret scanning, vulnerability disclosure.
- **[`compliance.md`](./compliance.md)** — EU AI Act, GDPR, PCI DSS, SOC 2, HIPAA, ISO 27001 stances.

## Local-only directories (gitignored)

These directories exist locally for working artifacts but are excluded from git via `.gitignore`:

| Directory | Purpose |
|---|---|
| `competition/` | Quarterly competitive snapshots (private; see GTM playbook §11.3) |
| `marketing/` | Draft articles, social posts, launch announcements |
| `strategy/` | Business strategy + GTM playbook + monetization details |
| `weekly/` | `/weekly-plan` outputs |
| `monetization.md` (file) | Detailed Stripe + Neon + billing mechanics — kept local |

The strategic plan + GTM playbook live in `strategy/` locally. The companion **public** dev doc is `guides/tracking-plan.md` (event/identity contract — devs need this).

## Conventions

- **Cross-references** use relative paths (e.g. `[X](./guides/X.md)` from `docs/`, `[X](../guides/X.md)` from `docs/releases/`). Project-root references in `README.md` / `CLAUDE.md` / `CHANGELOG.md` use repo-root paths (`docs/guides/X.md`).
- **New release plans** go in `releases/v0.X-plan.md`. Reference them from `ROADMAP.md`.
- **New guides** go in `guides/`. Add them to the list above when you create one.
- **New ADRs** follow the existing numbering in `adr/`. Increment from `0007`.
- **Outdated content** is either deleted (commit history preserves it) or marked at the top with a `> **⚠️ This document is outdated.**` block pointing to the current source of truth.
