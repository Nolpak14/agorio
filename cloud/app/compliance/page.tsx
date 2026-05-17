import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/customer';
import CloudNavbar from '@/components/Navbar';

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const ctx = await getCurrentCustomer();
  if (!ctx) redirect('/auth/sign-in');

  if (!ctx.customer) {
    return (
      <>
        <CloudNavbar />
        <main className="max-w-2xl mx-auto px-6 py-16">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <h1 className="text-xl font-bold mb-3">No active subscription</h1>
            <p className="text-sm text-[var(--muted)] mb-6">
              Compliance exports are available to Agorio Pro subscribers.
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

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const fromDefault = monthStart.toISOString().slice(0, 10);
  const toDefault = today.toISOString().slice(0, 10);

  return (
    <>
      <CloudNavbar />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-1">Compliance exports</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Download audit-grade records for any date range up to 90 days. Output format follows the EU AI Act Annex IV
          documentation schema, suitable for filing with internal compliance or regulators.
        </p>

        <form
          method="GET"
          action="/api/compliance/export"
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-[var(--muted)]">From</span>
              <input
                type="date"
                name="from"
                defaultValue={fromDefault}
                required
                className="mt-1 w-full bg-[var(--code-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-[var(--muted)]">To</span>
              <input
                type="date"
                name="to"
                defaultValue={toDefault}
                required
                className="mt-1 w-full bg-[var(--code-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">Include</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="include" value="runs" defaultChecked /> Runs
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="include" value="spans" /> Spans
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="include" value="logs" /> Logs
              </label>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              Runs are always the canonical record. Spans + logs expand the export with intermediate steps for
              deep forensic review.
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">Format</legend>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="format" value="csv" defaultChecked /> CSV
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="format" value="json" /> JSON
              </label>
            </div>
          </fieldset>

          <button
            type="submit"
            className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm text-black font-semibold transition-all hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
          >
            Download export
          </button>
        </form>

        <div className="mt-8 text-xs text-[var(--muted)] space-y-2">
          <p>
            <strong className="text-[var(--fg)]">Schema:</strong> EU-AI-Act-Annex-IV-v1.
          </p>
          <p>
            <strong className="text-[var(--fg)]">Retention:</strong> exports cover whatever runs are still in
            Cloud storage. Default retention is 12 months on Pro; enterprise customers can configure longer.
          </p>
          <p>
            <strong className="text-[var(--fg)]">Data residency:</strong> EU-region storage is available for
            enterprise tenants — see{' '}
            <Link href="https://github.com/Nolpak14/agorio/blob/main/docs/compliance.md" className="text-[var(--accent)] hover:underline">
              docs/compliance.md
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
