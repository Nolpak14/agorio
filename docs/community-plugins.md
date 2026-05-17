# Community plugins program

Anyone can publish an `@agorio/sdk`-compatible plugin to npm. The community plugins program is
the informal review + listing process that makes those plugins discoverable.

## What counts as a plugin

Two shapes:

1. **`EnterprisePlugin`** — lifecycle middleware. Hooks into `onBeforeToolCall`,
   `onAfterToolCall`, `onRegister`, `onInit`, and the v0.7 `hydrate?(state)`. See the six
   reference plugins in `plugins/` (spending-controls, approval-workflow, audit-trail,
   agent-identity, policy-engine, procurement).

2. **`AgentPlugin`** — simpler. Adds custom tools (name, JSON schema, handler). Use when you
   want the agent to call your function as a tool.

`plugin-development.md` has full code-walkthroughs.

## Publishing

Recommended package shape:

```
@your-org/agorio-plugin-<name>/
├── src/index.ts          # exports your plugin factory
├── tests/                # ≥ 1 test against MockMerchant
├── package.json
├── README.md
└── LICENSE
```

`package.json` requirements:

```json
{
  "name": "@your-org/agorio-plugin-<name>",
  "peerDependencies": {
    "@agorio/sdk": "^1.0.0"
  }
}
```

Plugins must:

- Be MIT-licensed (or another OSI-approved permissive license) **if** they want listing in the
  registry. Proprietary plugins are welcome but unlisted.
- Pass `npm audit` clean on transitive runtime dependencies.
- Ship TypeScript types.
- Include at least one test that runs against `MockMerchant`.

## Listing in the registry

Open a PR to this repo adding your plugin to `docs/plugins-registry.md` with:

- Package name + npm URL + repo URL
- Maintainer name + contact
- One-line description
- Lifecycle hooks used (helps users skim for compatibility)
- Date of last audit pass

Reviewers will check:

- The package installs cleanly into a fresh `@agorio/sdk` v1 project.
- The README explains configuration options.
- The plugin doesn't ship telemetry to a non-customer-controlled endpoint by default.

There is no exclusivity — the registry is a convenience, not gatekeeping.

## "Agorio Compatible" badge

Plugins that pass the listing review can use the `[Agorio Compatible — v1]` badge in their
README. We may add a programmatic check in a future release; today it's an honor system.

## Certified plugins

A small number of plugins may be reviewed deeper by the agorio core team and labeled
**certified**. Certification requirements (per agorio v1.0):

- Plugin has been at v1.0+ for at least 3 months
- ≥ 100 monthly npm downloads
- Maintainer commits to a 30-day security patch SLA
- Independent security review on file (we can refer one)

Certification is renewed annually. List of certified plugins lives in
`docs/plugins-registry.md` under the "Certified" heading.

## Becoming a contributor instead

If your plugin is broadly useful and you'd rather it live in this repo, open an RFC issue
describing the use case. Plugins that ship in `plugins/` get:

- CI coverage on every release
- Auto-publish via the SDK release workflow
- Inclusion in the headline `examples/procurement/` demo where applicable

The trade-off is you accept the same review cadence as the rest of the codebase.
