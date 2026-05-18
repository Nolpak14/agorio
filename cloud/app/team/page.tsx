import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orgMembers, type OrgMember } from '@/db/schema';
import { getCurrentOrgContext, roleAtLeast } from '@/lib/rbac';
import CloudNavbar from '@/components/Navbar';
import { relativeTime } from '@/lib/format';
import InviteMemberForm from './InviteMemberForm';
import MemberRow from './MemberRow';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect('/auth/sign-in');

  if (!ctx.customer) {
    return (
      <>
        <CloudNavbar />
        <main className="max-w-2xl mx-auto px-6 py-16">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <h1 className="text-xl font-bold mb-3">No active subscription</h1>
            <p className="text-sm text-[var(--muted)] mb-6">
              Team management is available to Agorio Pro subscribers.
            </p>
            <Link
              href="https://agorio.dev/pricing"
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm text-black font-semibold transition-all hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
              style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
            >
              View pricing →
            </Link>
          </div>
        </main>
      </>
    );
  }

  const members: OrgMember[] = await db
    .select()
    .from(orgMembers)
    .where(eq(orgMembers.orgId, ctx.org.id))
    .orderBy(asc(orgMembers.invitedAt));

  const canManage = roleAtLeast(ctx.role, 'admin');
  const isOwner   = roleAtLeast(ctx.role, 'owner');

  return (
    <>
      <CloudNavbar />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">{ctx.org.name}</h1>
            <p className="text-sm text-[var(--muted)]">
              {members.length} {members.length === 1 ? 'member' : 'members'} ·
              {' '}
              <span className="font-mono text-[var(--accent)]">{ctx.role}</span>
            </p>
          </div>
        </div>

        {canManage ? (
          <InviteMemberForm canGrantAdmin={isOwner} />
        ) : (
          <p className="mb-6 text-xs text-[var(--muted)]">
            Read-only access — ask an org admin to invite or change roles.
          </p>
        )}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={{
                    id:         m.id,
                    email:      m.email,
                    role:       m.role,
                    invitedAt:  m.invitedAt.toISOString(),
                    acceptedAt: m.acceptedAt ? m.acceptedAt.toISOString() : null,
                    isSelf:     m.email === ctx.email,
                    relativeInvited: relativeTime(m.invitedAt),
                  }}
                  canManage={canManage}
                  canGrantAdmin={isOwner}
                />
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs text-[var(--muted)]">
          Members access Cloud at <code className="font-mono text-[var(--accent)]">cloud.agorio.dev</code> with their invited email.
          Role changes apply on next sign-in.
        </p>
      </main>
    </>
  );
}
