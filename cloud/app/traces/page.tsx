import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { traceRuns } from '@/db/schema';
import { getCurrentCustomer } from '@/lib/customer';
import CloudNavbar from '@/components/Navbar';
import { formatDurationMs, formatNumber, relativeTime, truncate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TracesListPage() {
  const ctx = await getCurrentCustomer();
  if (!ctx) redirect('/login');

  if (!ctx.customer) {
    return (
      <>
        <CloudNavbar />
        <main className="max-w-2xl mx-auto px-6 py-16">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <h1 className="text-xl font-bold mb-3">No active subscription</h1>
            <p className="text-sm text-[var(--muted)] mb-6">
              Agorio Cloud is included with Agorio Pro. Subscribe to start ingesting traces.
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

  const runs = await db
    .select()
    .from(traceRuns)
    .where(eq(traceRuns.customerId, ctx.customer.id))
    .orderBy(desc(traceRuns.startedAt))
    .limit(50);

  return (
    <>
      <CloudNavbar />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Traces</h1>
            <p className="text-sm text-[var(--muted)]">
              {runs.length === 0
                ? 'No runs ingested yet.'
                : `Showing the ${runs.length} most recent ${runs.length === 1 ? 'run' : 'runs'}.`}
            </p>
          </div>
        </div>

        {runs.length === 0 ? <EmptyState /> : <RunsTable runs={runs} />}
      </main>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
      <h2 className="text-lg font-semibold mb-3">Send your first trace</h2>
      <p className="text-sm text-[var(--muted)] mb-5">
        Three steps to your first trace:
      </p>

      <ol className="space-y-3 mb-6 text-sm">
        <li className="flex gap-3">
          <span className="font-mono text-[var(--accent)] shrink-0">1.</span>
          <span>
            <Link
              href="/api-keys"
              className="text-[var(--accent)] hover:underline font-medium"
            >
              Create an API key →
            </Link>{' '}
            <span className="text-[var(--muted)]">and copy it.</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-[var(--accent)] shrink-0">2.</span>
          <span className="text-[var(--fg-dim)]">
            Install <code className="font-mono text-[var(--accent)]">@agorio/sdk@^0.6.0</code> and wire it into your agent:
          </span>
        </li>
      </ol>

      <pre className="bg-[var(--code-bg)] border border-[var(--border)] rounded-lg p-4 text-sm overflow-x-auto font-mono mb-4">
{`import { ShoppingAgent, agorioCloud, ClaudeAdapter } from '@agorio/sdk';

const cloud = agorioCloud({ apiKey: process.env.AGORIO_API_KEY! });

const agent = new ShoppingAgent({
  llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  ...cloud,
});

await agent.run('find me running shoes under $100');`}
      </pre>

      <ol start={3} className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="font-mono text-[var(--accent)] shrink-0">3.</span>
          <span className="text-[var(--fg-dim)]">
            Run your agent. Traces appear here within a few seconds.
          </span>
        </li>
      </ol>

      <div className="mt-6 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted)] flex items-center gap-4">
        <Link href="/api-keys" className="hover:text-[var(--accent)] transition-colors">
          → Create API key
        </Link>
        <span>·</span>
        <a
          href="https://github.com/Nolpak14/agorio#send-traces-to-agorio-cloud"
          target="_blank"
          rel="noopener"
          className="hover:text-[var(--accent)] transition-colors"
        >
          Full setup guide
        </a>
      </div>
    </div>
  );
}

function RunsTable({ runs }: { runs: Array<typeof traceRuns.$inferSelect> }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Task</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">LLM calls</th>
            <th className="px-4 py-3 font-medium text-right">Tool calls</th>
            <th className="px-4 py-3 font-medium text-right">Tokens</th>
            <th className="px-4 py-3 font-medium text-right">Latency</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--card-hover)] transition-colors">
              <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">{relativeTime(run.startedAt)}</td>
              <td className="px-4 py-3 text-[var(--fg)]">{truncate(run.task, 80)}</td>
              <td className="px-4 py-3">
                <span className={`status-pill ${run.status}`}>{run.status.replace('_', ' ')}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatNumber(run.llmCalls)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatNumber(run.toolCalls)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatNumber(run.totalTokens)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatDurationMs(run.totalLatencyMs)}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/traces/${run.id}`}
                  className="text-[var(--accent)] hover:underline text-sm"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
