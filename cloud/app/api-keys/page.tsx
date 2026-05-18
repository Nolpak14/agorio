import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { apiKeys, type ApiKey } from '@/db/schema';
import { getCurrentOrgContext, roleAtLeast } from '@/lib/rbac';
import CloudNavbar from '@/components/Navbar';
import CreateApiKeyForm from './CreateApiKeyForm';
import { revokeApiKey } from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ created?: string }>;
}

export default async function ApiKeysPage({ searchParams }: PageProps) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect('/auth/sign-in');

  const sp = await searchParams;
  const createdKey = typeof sp.created === 'string' ? sp.created : undefined;
  const canManage  = roleAtLeast(ctx.role, 'admin');

  if (!ctx.customer) {
    return (
      <>
        <CloudNavbar />
        <main className="max-w-2xl mx-auto px-6 py-16">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <h1 className="text-xl font-bold mb-3">No active subscription</h1>
            <p className="text-sm text-[var(--muted)] mb-6">
              API keys are issued to Agorio Pro subscribers.
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

  const keys: ApiKey[] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.customerId, ctx.customer.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <>
      <CloudNavbar />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">API keys</h1>
            <p className="text-sm text-[var(--muted)]">
              Pass an API key to <code className="font-mono text-[var(--accent)]">agorioCloud&#123; apiKey &#125;</code> in your agent options.
            </p>
          </div>
        </div>

        {createdKey && <RevealCard apiKey={createdKey} />}

        {canManage ? (
          <CreateApiKeyForm />
        ) : (
          <p className="mb-6 text-xs text-[var(--muted)]">
            Viewer access — ask an org admin to mint or revoke API keys.
          </p>
        )}

        <ApiKeysList keys={keys} canManage={canManage} />

        <div className="mt-10 text-xs text-[var(--muted)] flex items-center gap-3">
          <span>License key + billing:</span>
          <Link
            href="https://agorio.dev/dashboard"
            className="text-[var(--accent)] hover:underline"
          >
            agorio.dev/dashboard →
          </Link>
        </div>
      </main>
    </>
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

function ApiKeysList({ keys, canManage }: { keys: ApiKey[]; canManage: boolean }) {
  if (keys.length === 0) {
    return <p className="text-sm text-[var(--muted)] mt-4">No active API keys yet.</p>;
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
                {canManage ? (
                  <form action={revokeApiKey}>
                    <input type="hidden" name="id" value={k.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Revoke
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-[var(--muted)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
