import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { traceRuns, traceSpans, traceLogs } from '@/db/schema';
import { getCurrentCustomer } from '@/lib/customer';
import CloudNavbar from '@/components/Navbar';
import { formatDurationMs, formatNumber, relativeTime } from '@/lib/format';
import TraceAutoRefresh from './TraceAutoRefresh';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function TraceDetailPage({ params }: PageProps) {
  const { runId } = await params;

  const ctx = await getCurrentCustomer();
  if (!ctx) redirect('/login');
  if (!ctx.customer) redirect('/traces');

  const [run] = await db.select().from(traceRuns).where(eq(traceRuns.id, runId)).limit(1);
  if (!run || run.customerId !== ctx.customer.id) notFound();

  const [spans, logs] = await Promise.all([
    db.select().from(traceSpans).where(eq(traceSpans.runId, runId)).orderBy(asc(traceSpans.startedAt)),
    db.select().from(traceLogs).where(eq(traceLogs.runId, runId)).orderBy(asc(traceLogs.timestamp)),
  ]);

  return (
    <>
      <CloudNavbar />
      {run.status === 'in_progress' && <TraceAutoRefresh />}
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
        <div>
          <Link href="/traces" className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            ← All traces
          </Link>
          <div className="flex items-start justify-between mt-3 gap-4">
            <h1 className="text-2xl font-bold break-words">{run.task}</h1>
            <span className={`status-pill ${run.status} shrink-0`}>{run.status.replace('_', ' ')}</span>
          </div>
          <p className="text-sm text-[var(--muted)] mt-2">
            Started {relativeTime(run.startedAt)} · Run ID <code className="font-mono">{run.id}</code>
          </p>
        </div>

        <UsageCard run={run} />

        <Section title={`Spans (${spans.length})`}>
          {spans.length === 0 ? (
            <Empty>No spans captured for this run.</Empty>
          ) : (
            <SpansTable spans={spans} />
          )}
        </Section>

        <Section title={`Logs (${logs.length})`}>
          {logs.length === 0 ? (
            <Empty>No logs captured for this run.</Empty>
          ) : (
            <LogsTable logs={logs} />
          )}
        </Section>

        {(run.finalAnswer || run.error) && (
          <Section title={run.error ? 'Error' : 'Final answer'}>
            <pre className="bg-[var(--code-bg)] border border-[var(--border)] rounded-lg p-4 text-sm whitespace-pre-wrap break-words font-mono">
              {run.error || run.finalAnswer}
            </pre>
          </Section>
        )}
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wider text-[var(--muted)] mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
      {children}
    </div>
  );
}

function UsageCard({ run }: { run: typeof traceRuns.$inferSelect }) {
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Total tokens', value: formatNumber(run.totalTokens) },
    { label: 'Prompt tokens', value: formatNumber(run.promptTokens) },
    { label: 'Completion tokens', value: formatNumber(run.completionTokens) },
    { label: 'LLM calls', value: formatNumber(run.llmCalls) },
    { label: 'Tool calls', value: formatNumber(run.toolCalls) },
    { label: 'Total latency', value: formatDurationMs(run.totalLatencyMs) },
  ];
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 grid grid-cols-2 md:grid-cols-6 gap-4">
      {fields.map((f) => (
        <div key={f.label}>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">{f.label}</p>
          <p className="font-mono text-lg">{f.value}</p>
        </div>
      ))}
    </div>
  );
}

function SpansTable({ spans }: { spans: Array<typeof traceSpans.$inferSelect> }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Attributes</th>
            <th className="px-4 py-3 font-medium text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {spans.map((s) => (
            <tr key={s.id} className="border-b border-[var(--border)] last:border-b-0 align-top">
              <td className="px-4 py-3 font-mono">{s.name}</td>
              <td className="px-4 py-3 text-[var(--muted)]">
                {s.attributes && Object.keys(s.attributes).length > 0 ? (
                  <code className="font-mono text-xs">{JSON.stringify(s.attributes)}</code>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatDurationMs(s.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTable({ logs }: { logs: Array<typeof traceLogs.$inferSelect> }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Level</th>
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Data</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-[var(--border)] last:border-b-0 align-top">
              <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">{relativeTime(l.timestamp)}</td>
              <td className={`px-4 py-3 font-mono uppercase text-xs level-${l.level}`}>{l.level}</td>
              <td className="px-4 py-3">{l.message}</td>
              <td className="px-4 py-3 text-[var(--muted)]">
                {l.data && Object.keys(l.data).length > 0 ? (
                  <code className="font-mono text-xs">{JSON.stringify(l.data)}</code>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
