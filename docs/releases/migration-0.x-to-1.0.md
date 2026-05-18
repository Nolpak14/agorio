# Migrating from 0.x to 1.0

`@agorio/sdk` v1.0.0 is the first release with a stable public API. This guide walks through
every breaking change introduced between v0.7 and v1.0 and shows the minimum edits required to
move a working v0.7 agent to v1.0.

> **TL;DR** — most code keeps working. The only mandatory edits are renaming
> `experimental_ap2` to `ap2` and switching to the new `@agorio/sdk/security` import for
> attestation if you were on the v0.8 release candidate.

## Required edits

### 1. `experimental_ap2` → `ap2`

The flag was promoted to GA in v0.8. v1.0 removes the deprecated alias.

```diff
 const agent = new ShoppingAgent({
   llm: claude,
-  experimental_ap2: true,
+  ap2: true,
 });
```

### 2. AP2 receivers should adopt `verifyMandateShape`

If you wrote your own structural checker, the SDK now ships one:

```ts
import { verifyMandateShape } from '@agorio/sdk';

const result = verifyMandateShape(signedMandate);
if (!result.ok) throw new Error(result.reason);
```

This is additive — your own checker still works, but the SDK version is the canonical reference
implementation.

### 3. Cloud schema additions

Cloud customers running self-hosted deployments must apply the new migrations introduced for
v1.0:

- `orgs`, `org_members` — RBAC tables (v1.0)
- `cloud_audit_log` — audit log (v1.0)

Cloud (hosted) customers get this automatically. Self-hosted customers run:

```bash
cd cloud && npm run db:push
```

against the same Neon/Postgres instance.

## Optional but recommended

### Adopt agent identity attestation

If you're calling merchant APIs over the public internet, add the v0.8 `AgentAttestation`
helper. It's an opt-in HMAC over an outgoing request envelope.

```ts
import { AgentAttestation } from '@agorio/sdk';

const att = new AgentAttestation({
  agentId: 'agent_acme_procurement_001',
  secret: process.env.AGENT_SECRET!,
});

const fetchWithAttestation = att.wrapFetch();

// Pass to any adapter that accepts `fetch:`
const shopify = new ShopifyAdapter({ shop: '...', accessToken: '...', fetch: fetchWithAttestation });
```

### Bench your changes

Run the new benchmark harness on any PR that touches the agent core:

```bash
npx tsx bench/run.ts
```

Compare the printed table against `bench/baseline-v0.8.0.json`. Regressions over ~10% on any
scenario should be justified in the PR description.

## What did **not** change

- The `ShoppingAgent` constructor signature
- All 17 built-in tools
- The `EnterprisePlugin` lifecycle hooks (incl. `hydrate?(state)`)
- `AgentChain` / `SubAgent` composition (v0.7+)
- `SessionStorage` and the `MemorySessionStorage` / `FileSessionStorage` shipped storages
- The wire format of `agorioCloud()` ingestion

## Removed in v1.0

| Symbol | Removed in | Replacement |
| ------ | ---------- | ----------- |
| `AgentOptions.experimental_ap2` | v1.0 | `AgentOptions.ap2` |

That's it — v1.0 is intentionally a stability release, not a refactor. If you hit a migration
edge case the table above doesn't cover, open an issue.
