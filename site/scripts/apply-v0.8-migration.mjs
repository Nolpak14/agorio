#!/usr/bin/env node
/**
 * One-shot v0.8 schema migration applied via the Neon HTTP driver
 * (same path `site/db/index.ts` uses at runtime).
 *
 * Purely additive — creates the `org_role` enum and three new tables
 * (orgs, org_members, cloud_audit_log) plus their indexes. No drops,
 * no renames, no column-type changes. Safe to re-run; every statement
 * is guarded with IF NOT EXISTS.
 *
 * Run from site/ with .env.local populated:
 *   node scripts/apply-v0.8-migration.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually — no dotenv dep.
function loadEnv() {
  const path = resolve(__dirname, '..', '.env.local');
  let body = '';
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    console.error(`Could not read ${path}`);
    process.exit(1);
  }
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;
    const value = raw.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

loadEnv();

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED is not set');
  process.exit(1);
}

const sql = neon(url);

const statements = [
  // 1. org_role enum
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
       CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member', 'viewer');
     END IF;
   END $$;`,

  // 2. orgs table
  `CREATE TABLE IF NOT EXISTS orgs (
     id          SERIAL PRIMARY KEY,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     name        TEXT NOT NULL,
     created_at  TIMESTAMP DEFAULT NOW() NOT NULL
   );`,

  // 3. org_members table
  `CREATE TABLE IF NOT EXISTS org_members (
     id          SERIAL PRIMARY KEY,
     org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
     email       TEXT NOT NULL,
     role        org_role NOT NULL DEFAULT 'member',
     invited_at  TIMESTAMP DEFAULT NOW() NOT NULL,
     accepted_at TIMESTAMP
   );`,

  // 4. org_members indexes
  `CREATE INDEX IF NOT EXISTS org_members_org_idx   ON org_members(org_id);`,
  `CREATE INDEX IF NOT EXISTS org_members_email_idx ON org_members(email);`,

  // 5. cloud_audit_log table
  `CREATE TABLE IF NOT EXISTS cloud_audit_log (
     id          SERIAL PRIMARY KEY,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     actor_email TEXT NOT NULL,
     action      TEXT NOT NULL,
     target      TEXT,
     metadata    JSONB,
     ip_address  TEXT,
     user_agent  TEXT,
     created_at  TIMESTAMP DEFAULT NOW() NOT NULL
   );`,

  // 6. cloud_audit_log index
  `CREATE INDEX IF NOT EXISTS cloud_audit_customer_time_idx
     ON cloud_audit_log(customer_id, created_at DESC);`,
];

console.log(`Applying ${statements.length} statements against ${url.replace(/:[^:@]+@/, ':****@').split('?')[0]}…\n`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const firstLine = stmt.trim().split('\n')[0].slice(0, 80);
  process.stdout.write(`[${i + 1}/${statements.length}] ${firstLine} … `);
  try {
    await sql.query(stmt);
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error(err.message || err);
    process.exit(1);
  }
}

// Verify
const [enumRow] = await sql`SELECT 1 AS exists FROM pg_type WHERE typname = 'org_role'`;
const tableRows = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('orgs', 'org_members', 'cloud_audit_log')
  ORDER BY table_name
`;

console.log(`\nVerification:`);
console.log(`  org_role enum present:        ${enumRow?.exists ? 'yes' : 'NO'}`);
console.log(`  tables present (${tableRows.length}/3):       ${tableRows.map(r => r.table_name).join(', ')}`);
console.log('\nMigration complete.');
