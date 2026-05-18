import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  customers,
  orgs,
  orgMembers,
  type Customer,
  type Org,
} from '@/db/schema';
import { auth } from '@/lib/auth-server';
import { appendAudit } from '@/lib/audit';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_RANK: Record<OrgRole, number> = {
  owner:  4,
  admin:  3,
  member: 2,
  viewer: 1,
};

export function roleAtLeast(actual: OrgRole, minimum: OrgRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

export interface OrgContext {
  email:    string;
  customer: Customer;
  org:      Org;
  role:     OrgRole;
}

/**
 * Resolve the authenticated session to (customer, org, role).
 *
 * Resolution order:
 *  1. session email === customer email  →  owner of customer's default org
 *  2. session email in `org_members`     →  the stored role on that org
 *
 * Returns null if no session, no matching customer/org, or no membership.
 *
 * Lazily seeds the customer's default org + owner `org_members` row on first
 * access so the 1:1 customer→org mapping promised in schema.ts:147 is
 * realized without a separate migration script.
 */
export async function getCurrentOrgContext(): Promise<OrgContext | null> {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) return null;

  const email = session.user.email;

  // 1. Direct customer match — implicit owner.
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (customer) {
    const org = await ensureDefaultOrg(customer);
    return { email, customer, org, role: 'owner' };
  }

  // 2. Invited member match — look up by email.
  const [membership] = await db
    .select({
      role:  orgMembers.role,
      orgId: orgMembers.orgId,
    })
    .from(orgMembers)
    .where(eq(orgMembers.email, email))
    .limit(1);

  if (!membership) return null;

  const [org] = await db.select().from(orgs).where(eq(orgs.id, membership.orgId)).limit(1);
  if (!org) return null;

  const [orgCustomer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, org.customerId))
    .limit(1);

  if (!orgCustomer) return null;

  return { email, customer: orgCustomer, org, role: membership.role };
}

/**
 * Ensure the customer has a default org and an owner `org_members` row for
 * their email. Idempotent — safe to call on every session resolution.
 */
async function ensureDefaultOrg(customer: Customer): Promise<Org> {
  const [existing] = await db
    .select()
    .from(orgs)
    .where(eq(orgs.customerId, customer.id))
    .limit(1);

  if (existing) {
    await ensureOwnerMembership(existing.id, customer.email);
    return existing;
  }

  const [created] = await db
    .insert(orgs)
    .values({ customerId: customer.id, name: defaultOrgName(customer.email) })
    .returning();

  await ensureOwnerMembership(created.id, customer.email);
  return created;
}

async function ensureOwnerMembership(orgId: number, email: string): Promise<void> {
  const [existing] = await db
    .select({ id: orgMembers.id, role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.email, email)))
    .limit(1);

  if (existing) {
    if (existing.role !== 'owner') {
      await db.update(orgMembers).set({ role: 'owner' }).where(eq(orgMembers.id, existing.id));
    }
    return;
  }

  await db.insert(orgMembers).values({
    orgId,
    email,
    role: 'owner',
    acceptedAt: new Date(),
  });
}

function defaultOrgName(email: string): string {
  const domain = email.split('@')[1] ?? 'agorio';
  return domain.split('.')[0];
}

export class RbacError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = 'RbacError';
    this.status = status;
  }
}

/**
 * Server-action guard. Resolves the current org context and throws RbacError
 * if the actor's role is below `minimum`. Records a `rbac.denied` audit entry
 * on violation so admins can see attempted privilege escalation in the audit
 * log.
 */
export async function requireRole(minimum: OrgRole): Promise<OrgContext> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new RbacError('Not authenticated', 401);

  if (!roleAtLeast(ctx.role, minimum)) {
    await appendAudit({
      customerId: ctx.customer.id,
      actorEmail: ctx.email,
      action:     'rbac.denied',
      target:     minimum,
      metadata:   { actualRole: ctx.role, requiredRole: minimum },
    });
    throw new RbacError(`Requires ${minimum} role (have ${ctx.role})`, 403);
  }

  return ctx;
}
