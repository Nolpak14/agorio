# Self-hosted Agorio Cloud

Most customers run `cloud.agorio.dev`. Enterprises with data-residency, air-gapped, or sovereign-
cloud requirements can run the same stack themselves.

## What you get

A self-hosted deployment provides the same surface as `cloud.agorio.dev`:

- Trace explorer (`/traces`, `/traces/[runId]`)
- API key management (`/api-keys`)
- Compliance export endpoint (`/api/compliance/export`)
- Audit log (`/audit-log`)
- Trace ingest endpoint (`/api/ingest`) — point the SDK at it via `agorioCloud({ apiKey, ingestUrl })`

You do **not** get:

- The marketing site (`agorio.dev`) — Stripe billing isn't part of self-hosted because it
  doesn't make sense without our merchant of record relationship.
- Cross-customer fleet view — every self-hosted deployment is single-tenant by design.
- Automatic upgrades. You roll your own.

## Requirements

- Docker 24+ and Docker Compose v2, OR a Kubernetes cluster (Helm chart is on the roadmap).
- Postgres 16 (the compose bundle ships one; production should swap in a managed instance).
- Optional: Neon Auth project for SSO. Without it, the dashboard runs in anonymous-trace-only
  mode (ingest still works; UI features that need user identity are disabled).

## Quick start (Docker Compose)

```bash
cp docker/.env.example docker/.env
# Edit docker/.env — at minimum, change POSTGRES_PASSWORD.

docker compose -f docker/docker-compose.yml --env-file docker/.env up -d

# Wait ~30 seconds for the `migrate` service to run, then:
open http://localhost:3001
```

The `migrate` service runs `drizzle-kit push` against the freshly-started Postgres and exits.
The `cloud` service waits for it via `depends_on.migrate.condition: service_completed_successfully`.

## Pointing the SDK at your self-hosted instance

```ts
import { ShoppingAgent, agorioCloud } from '@agorio/sdk';

const cloud = agorioCloud({
  apiKey: process.env.AGORIO_API_KEY!,
  ingestUrl: 'https://cloud.internal.example.com/api/ingest',
});

const agent = new ShoppingAgent({ llm, ...cloud });
```

## Backups

The `agorio-pg` Docker volume holds all customer data. Recommended retention:

- Daily logical backups (`pg_dump`) for the last 14 days
- Weekly snapshots retained 3 months
- Monthly snapshots retained 7 years for compliance posture

If you're using a managed Postgres, use its native PITR.

## Upgrades

```bash
git pull
docker compose -f docker/docker-compose.yml --env-file docker/.env build --no-cache cloud migrate
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --force-recreate cloud
```

The `migrate` service runs idempotently each startup — it is safe to re-run.

## Helm chart

Planned for v1.0. Tracked at issue #39 (sub-task: "On-prem / self-hosted option").

## Support

Enterprise tier ($ — see pricing page) includes installation support and a quarterly upgrade
review. Reach out to enterprise@agorio.dev.
