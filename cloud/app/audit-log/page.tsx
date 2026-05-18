import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { cloudAuditLog, type CloudAuditEntry } from '@/db/schema';
import { getCurrentOrgContext } from '@/lib/rbac';
import CloudNavbar from '@/components/Navbar';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
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
              The audit log is available to Agorio Pro subscribers.
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

  const entries: CloudAuditEntry[] = await db
    .select()
    .from(cloudAuditLog)
    .where(eq(cloudAuditLog.customerId, ctx.customer.id))
    .orderBy(desc(cloudAuditLog.createdAt))
    .limit(200);

  return (
    <>
      <CloudNavbar />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-1">Audit log</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Append-only record of dashboard actions. Last 200 entries; export-grade history is in the
          compliance export.
        </p>

        {entries.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No actions recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-3 text-xs text-[var(--muted)]" title={e.createdAt.toISOString()}>
                      {relativeTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">{e.actorEmail}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--accent)]">{e.action}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{e.target ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{e.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
