import { redirect } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth-server';
import { db } from '@/db';
import { customers } from '@/db/schema';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/login');

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, session.user.email))
    .limit(1);

  return (
    <main className="pt-20 px-6 max-w-2xl mx-auto min-h-screen">
      <div className="py-12">
        <h1 className="text-3xl font-bold mb-2">Your License</h1>
        <p className="text-[var(--muted)] mb-10">
          Signed in as <span className="text-[var(--fg)]">{session.user.email}</span>
        </p>

        {customer ? (
          <div className="space-y-6">
            {/* License key card */}
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--card)] p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
                  License Key
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  customer.status === 'active'
                    ? 'text-green-400 border-green-400/40 bg-green-400/10'
                    : customer.status === 'past_due'
                    ? 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10'
                    : 'text-red-400 border-red-400/40 bg-red-400/10'
                }`}>
                  {customer.status}
                </span>
              </div>
              <code className="block font-mono text-sm text-[var(--fg)] bg-[var(--code-bg)] rounded-lg px-4 py-3 break-all">
                {customer.licenseKey}
              </code>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Set <code className="font-mono bg-[var(--code-bg)] px-1 rounded">AGORIO_LICENSE_KEY</code> in your environment to activate the plugins.
              </p>
            </div>

            {/* Plan info */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--muted)] mb-1">Plan</p>
                  <p className="font-semibold capitalize">{customer.plan}</p>
                </div>
                <ManageBillingButton />
              </div>
            </div>

            {/* Docs link */}
            <div className="text-center pt-4">
              <Link
                href="https://github.com/Nolpak14/agorio"
                target="_blank"
                rel="noopener"
                className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              >
                View plugin documentation on GitHub →
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <p className="text-[var(--muted)] mb-6">
              No active subscription found for this email address.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm text-black font-semibold transition-all hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
              style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
            >
              Get Agorio Pro
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function ManageBillingButton() {
  return (
    <form action="/api/create-portal-session" method="POST">
      <button
        type="submit"
        className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
      >
        Manage billing
      </button>
    </form>
  );
}
