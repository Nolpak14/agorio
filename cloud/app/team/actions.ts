'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orgMembers } from '@/db/schema';
import { appendAudit } from '@/lib/audit';
import { requireRole, roleAtLeast, type OrgRole } from '@/lib/rbac';
import { sendInviteEmail } from '@/lib/emails';

const VALID_ROLES: readonly OrgRole[] = ['admin', 'member', 'viewer'];

function parseRole(input: unknown): OrgRole {
  const r = String(input ?? '').trim() as OrgRole;
  if (!VALID_ROLES.includes(r)) throw new Error(`Invalid role: ${r}`);
  return r;
}

export async function inviteMember(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role  = parseRole(formData.get('role'));

  if (!email || !email.includes('@')) throw new Error('Valid email required');

  const ctx = await requireRole('admin');

  const [existing] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.email, email)))
    .limit(1);

  if (existing) throw new Error(`${email} is already a member`);

  await db.insert(orgMembers).values({
    orgId: ctx.org.id,
    email,
    role,
  });

  await appendAudit({
    customerId: ctx.customer.id,
    actorEmail: ctx.email,
    action:     'team.invite',
    target:     email,
    metadata:   { role },
  });

  try {
    await sendInviteEmail({
      to:           email,
      inviterEmail: ctx.email,
      orgName:      ctx.org.name,
      role,
    });
  } catch (err) {
    console.error('[team] invite email failed:', err instanceof Error ? err.message : err);
  }

  revalidatePath('/team');
}

export async function changeRole(formData: FormData): Promise<void> {
  const memberId = Number(formData.get('memberId') ?? 0);
  const role     = parseRole(formData.get('role'));
  if (!Number.isFinite(memberId) || memberId <= 0) throw new Error('Invalid member id');

  const ctx = await requireRole('admin');

  const [member] = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, ctx.org.id)))
    .limit(1);

  if (!member) throw new Error('Member not found');
  if (member.role === 'owner') throw new Error('Cannot change owner role');

  // Only an owner can promote someone to admin.
  if (role === 'admin' && !roleAtLeast(ctx.role, 'owner')) {
    throw new Error('Only owners can grant admin');
  }

  await db
    .update(orgMembers)
    .set({ role })
    .where(eq(orgMembers.id, memberId));

  await appendAudit({
    customerId: ctx.customer.id,
    actorEmail: ctx.email,
    action:     'team.role.change',
    target:     member.email,
    metadata:   { from: member.role, to: role },
  });

  revalidatePath('/team');
}

export async function removeMember(formData: FormData): Promise<void> {
  const memberId = Number(formData.get('memberId') ?? 0);
  if (!Number.isFinite(memberId) || memberId <= 0) throw new Error('Invalid member id');

  const ctx = await requireRole('admin');

  const [member] = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, ctx.org.id)))
    .limit(1);

  if (!member) throw new Error('Member not found');
  if (member.role === 'owner') throw new Error('Cannot remove the org owner');
  if (member.email === ctx.email) throw new Error('Cannot remove yourself');

  await db.delete(orgMembers).where(eq(orgMembers.id, memberId));

  await appendAudit({
    customerId: ctx.customer.id,
    actorEmail: ctx.email,
    action:     'team.remove',
    target:     member.email,
    metadata:   { role: member.role },
  });

  revalidatePath('/team');
}
