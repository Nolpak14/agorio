import { redirect } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth-server';
import { db } from '@/db';
import { apiKeys, customers, type ApiKey } from '@/db/schema';
import CreateApiKeyForm from './CreateApiKeyForm';
import { revokeApiKey } from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ created?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/login');

  const sp = await searchParams;
  const createdKey = typeof sp.created === 'string' ? sp.created : undefined;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, session.user.email))
    .limit(1);

  const keys: ApiKey[] = customer
    ? await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.customerId, customer.id), isNull(apiKeys.revokedAt)))
        .orderBy(desc(apiKeys.createdAt))
    : [];

  return (
    <main className="pt-20 px-6 max-w-3xl mx-auto min-h-screen">
      <div className="py-12">
        <h1 className="text-3xl font-bold mb-2">Your account</h1>
        <p className="text-[var(--muted)] mb-10">
          Signed in as <span className="text-[var(--fg)]">{session.user.email}</span>
        </p>

        {customer ? (
          <div className="space-y-6">
            <LicenseKeyCard licenseKey={customer.licenseKey} status={customer.status} />

            <PlanCard plan={customer.plan} />

            <section id="api-keys">
              <div className="flex items-end justify-between mb-3">
                <h2 className="text-lg font-semibold">API keys</h2>
                <Link href="https://cloud.agorio.dev/traces" className="text-sm text-[var(--accent)] hover:underline">
                  Open Agorio Cloud →
                </Link>
              </div>
              <p className="text-sm text-[var(--muted)] mb-4">
                Pass an API key to <code className="font-mono bg-[var(--code-bg)] px-1 rounded">agorioCloud()</code> to ship traces to the dashboard.
              </p>

              {createdKey && <RevealCard apiKey={createdKey} />}

              <CreateApiKeyForm />

              <ApiKeysList keys={keys} />
            </section>

            <div className="text-center pt-4">
              <Link
                href="https://github.com/Nolpak14/agorio"
                target="_blank"
                rel="noopener"
                className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              >
                View SDK documentation on GitHub →
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

function LicenseKeyCard({ licenseKey, status }: { licenseKey: string; status: string }) {
  return (
    <div className="rounded-xl border border-[var(--accent)] bg-[var(--card)] p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
          License key
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            status === 'active'
              ? 'text-green-400 border-green-400/40 bg-green-400/10'
              : status === 'past_due'
              ? 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10'
              : 'text-red-400 border-red-400/40 bg-red-400/10'
          }`}
        >
          {status}
        </span>
      </div>
      <code className="block font-mono text-sm text-[var(--fg)] bg-[var(--code-bg)] rounded-lg px-4 py-3 break-all">
        {licenseKey}
      </code>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Your billing anchor. Issue scoped API keys below to send traces to Agorio Cloud.
      </p>
    </div>
  );
}

function PlanCard({ plan }: { plan: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--muted)] mb-1">Plan</p>
          <p className="font-semibold capitalize">{plan}</p>
        </div>
        <form action="/api/create-portal-session" method="POST">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            Manage billing
          </button>
        </form>
      </div>
    </div>
  );
}

function RevealCard({ apiKey }: { apiKey: string }) {
  return (
    <div className="rounded-xl border border-yellow-400/40 bg-yellow-400/5 p-6 mb-4">
      <p className="text-sm font-semibold text-yellow-300 mb-2">
        Copy this key now — you won&apos;t see it again.
      </p>
      <code className="block font-mono text-sm bg-[var(--code-bg)] border border-[var(--border)] rounded-lg px-4 py-3 break-all">
        {apiKey}
      </code>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Store it as <code className="font-mono">AGORIO_API_KEY</code> in your environment.
      </p>
    </div>
  );
}

function ApiKeysList({ keys }: { keys: ApiKey[] }) {
  if (keys.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] mt-4">No active API keys yet.</p>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Env</th>
            <th className="px-4 py-3 font-medium">Prefix</th>
            <th className="px-4 py-3 font-medium">Last used</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-4 py-3">{k.label}</td>
              <td className="px-4 py-3 uppercase text-xs text-[var(--muted)]">{k.env}</td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{k.keyPrefix}…</td>
              <td className="px-4 py-3 text-xs text-[var(--muted)]">
                {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'never'}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--muted)]">
                {new Date(k.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Revoke
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
