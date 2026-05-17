import {
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// ─── Customers (billing anchor) ───────────────────────────────────────────

export const customers = pgTable('customers', {
  id:                     serial('id').primaryKey(),
  stripeCustomerId:       text('stripe_customer_id').unique().notNull(),
  stripeSubscriptionId:   text('stripe_subscription_id').unique(),
  email:                  text('email').notNull(),
  licenseKey:             text('license_key').unique().notNull(),
  status:                 text('status', { enum: ['active', 'past_due', 'suspended', 'cancelled'] })
                            .notNull().default('active'),
  plan:                   text('plan', { enum: ['pro', 'enterprise'] })
                            .notNull().default('pro'),
  createdAt:              timestamp('created_at').defaultNow().notNull(),
  updatedAt:              timestamp('updated_at').defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

// ─── Agorio Cloud — Enums ────────────────────────────────────────────────

export const apiKeyEnv     = pgEnum('api_key_env',     ['dev', 'prod', 'test']);
export const traceStatus   = pgEnum('trace_status',    ['in_progress', 'success', 'failure']);
export const traceLogLevel = pgEnum('trace_log_level', ['debug', 'info', 'warn', 'error']);

// ─── Agorio Cloud — API keys ─────────────────────────────────────────────
// Format: agorio_sk_<env>_<32hex>. Issued from the dashboard; sent by the
// SDK as `Authorization: Bearer <key>` to /api/ingest.

export const apiKeys = pgTable(
  'api_keys',
  {
    id:         serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    key:        text('key').unique().notNull(),
    keyPrefix:  text('key_prefix').notNull(),
    label:      text('label').notNull(),
    env:        apiKeyEnv('env').notNull().default('prod'),
    createdAt:  timestamp('created_at').defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt:  timestamp('revoked_at'),
  },
  (t) => ({
    byCustomer: index('api_keys_customer_idx').on(t.customerId),
  })
);

export type ApiKey    = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

// ─── Agorio Cloud — Trace runs ───────────────────────────────────────────
// One row per `agorioCloud()`-instrumented agent.run() / runStream() invocation.
// id is a client-generated UUID so the SDK can stitch spans/logs to a run
// before the run completes. customerId is denormalized from apiKeys for
// query speed on the trace explorer.

export const traceRuns = pgTable(
  'trace_runs',
  {
    id:               text('id').primaryKey(),
    apiKeyId:         integer('api_key_id').notNull().references(() => apiKeys.id),
    customerId:       integer('customer_id').notNull().references(() => customers.id),
    task:             text('task').notNull(),
    status:           traceStatus('status').notNull().default('in_progress'),
    startedAt:        timestamp('started_at').notNull(),
    endedAt:          timestamp('ended_at'),
    totalLatencyMs:   integer('total_latency_ms'),
    totalTokens:      integer('total_tokens'),
    promptTokens:     integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    llmCalls:         integer('llm_calls'),
    toolCalls:        integer('tool_calls'),
    finalAnswer:      text('final_answer'),
    error:            text('error'),
    sdkVersion:       text('sdk_version'),
  },
  (t) => ({
    byCustomerTime: index('trace_runs_customer_started_idx').on(t.customerId, t.startedAt.desc()),
  })
);

export type TraceRun    = typeof traceRuns.$inferSelect;
export type NewTraceRun = typeof traceRuns.$inferInsert;

// ─── Agorio Cloud — Trace spans ──────────────────────────────────────────

export const traceSpans = pgTable(
  'trace_spans',
  {
    id:         serial('id').primaryKey(),
    runId:      text('run_id').notNull().references(() => traceRuns.id, { onDelete: 'cascade' }),
    name:       text('name').notNull(),
    attributes: jsonb('attributes').$type<Record<string, unknown>>(),
    startedAt:  timestamp('started_at').notNull(),
    endedAt:    timestamp('ended_at').notNull(),
    durationMs: integer('duration_ms').notNull(),
  },
  (t) => ({
    byRun: index('trace_spans_run_idx').on(t.runId),
  })
);

export type TraceSpan    = typeof traceSpans.$inferSelect;
export type NewTraceSpan = typeof traceSpans.$inferInsert;

// ─── Agorio Cloud — Trace logs ───────────────────────────────────────────

export const traceLogs = pgTable(
  'trace_logs',
  {
    id:        serial('id').primaryKey(),
    runId:     text('run_id').notNull().references(() => traceRuns.id, { onDelete: 'cascade' }),
    level:     traceLogLevel('level').notNull(),
    message:   text('message').notNull(),
    data:      jsonb('data').$type<Record<string, unknown>>(),
    timestamp: timestamp('timestamp').notNull(),
  },
  (t) => ({
    byRun: index('trace_logs_run_idx').on(t.runId),
  })
);

export type TraceLog    = typeof traceLogs.$inferSelect;
export type NewTraceLog = typeof traceLogs.$inferInsert;

// ─── Agorio Cloud — RBAC + audit (v1.0) ──────────────────────────────────
// Mirror of cloud/db/schema.ts — kept in sync per the header note in that file.

export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member', 'viewer']);

export const orgs = pgTable('orgs', {
  id:          serial('id').primaryKey(),
  customerId:  integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

export type Org    = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;

export const orgMembers = pgTable(
  'org_members',
  {
    id:        serial('id').primaryKey(),
    orgId:     integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    email:     text('email').notNull(),
    role:      orgRole('role').notNull().default('member'),
    invitedAt: timestamp('invited_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
  },
  (t) => ({
    byOrg:   index('org_members_org_idx').on(t.orgId),
    byEmail: index('org_members_email_idx').on(t.email),
  })
);

export type OrgMember    = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

export const cloudAuditLog = pgTable(
  'cloud_audit_log',
  {
    id:         serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    actorEmail: text('actor_email').notNull(),
    action:     text('action').notNull(),
    target:     text('target'),
    metadata:   jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress:  text('ip_address'),
    userAgent:  text('user_agent'),
    createdAt:  timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    byCustomerTime: index('cloud_audit_customer_time_idx').on(t.customerId, t.createdAt.desc()),
  })
);

export type CloudAuditEntry    = typeof cloudAuditLog.$inferSelect;
export type NewCloudAuditEntry = typeof cloudAuditLog.$inferInsert;
