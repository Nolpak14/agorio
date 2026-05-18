# Plugins registry

Curated list of community-maintained plugins for `@agorio/sdk`. Open a PR adding your plugin
following the [community plugins program](./guides/community-plugins.md) rules.

## Certified

_None yet. Certification process opens with agorio v1.0._

## Listed

| Package | Maintainer | Type | Hooks | Last audit |
| ------- | ---------- | ---- | ----- | ---------- |
| `@agorio/plugin-spending-controls`   | core team | EnterprisePlugin | onBeforeToolCall                                | 2026-05-17 |
| `@agorio/plugin-approval-workflow`   | core team | EnterprisePlugin | onBeforeToolCall, getState, hydrate             | 2026-05-17 |
| `@agorio/plugin-audit-trail`         | core team | EnterprisePlugin | onAfterToolCall                                 | 2026-05-17 |
| `@agorio/plugin-agent-identity`      | core team | EnterprisePlugin | onRegister, onBeforeToolCall                    | 2026-05-17 |
| `@agorio/plugin-policy-engine`       | core team | EnterprisePlugin | onBeforeToolCall                                | 2026-05-17 |
| `@agorio/plugin-procurement`         | core team | EnterprisePlugin | onBeforeToolCall, onAfterToolCall               | 2026-05-17 |

## Adapters registry

See [docs/adapters-registry.md](./adapters-registry.md) for merchant adapters.
