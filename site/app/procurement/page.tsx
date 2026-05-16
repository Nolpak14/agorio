import Link from 'next/link';

export const metadata = {
  title: 'Procurement agents on Agorio',
  description:
    'Build B2B procurement agents that comparison-shop merchants, gate purchases on human approval, attach PO numbers, and stream full audit trails to Agorio Cloud.',
};

const features = [
  {
    title: 'Multi-merchant price discovery',
    body: 'Comparison-shop Shopify, WooCommerce, and any UCP-native catalog in one chain. Pick the lowest total per line item or per cart.',
  },
  {
    title: 'Approval workflows that survive process restarts',
    body: 'Sub-agents pause at the approval gate and resume — minutes or days later — once a human reviewer clicks Approve. Backed by Redis or any pluggable SessionStorage.',
  },
  {
    title: 'PO numbers, vendors, expense categories',
    body: 'The procurement plugin generates and attaches PO numbers, resolves vendor metadata (payment terms, tax category, preferred-supplier status), and validates expense categories against your configured list.',
  },
  {
    title: 'EU AI Act-ready audit trail',
    body: 'Every tool call lands in the audit-trail plugin and the Agorio Cloud trace explorer. PO# + vendor + amount + category are first-class fields, ready for CSV / PDF export.',
  },
  {
    title: 'Spending controls per agent',
    body: 'Hard per-transaction and rolling daily caps, enforced via plugin middleware. The LLM cannot bypass them — the agent loop is blocked before submit_payment ever fires.',
  },
  {
    title: 'Full Cloud trace hierarchy',
    body: 'Multi-agent runs render as a tree in cloud.agorio.dev/traces. Sub-agent invocations, LLM calls, tool calls, and audit events all indented under the parent. Sharable URL per run.',
  },
];

const codeSample = `import {
  AgentChain,
  ShoppingAgent,
  ClaudeAdapter,
  agorioCloud,
  FileSessionStorage,
} from '@agorio/sdk';
import { createApprovalWorkflowPlugin } from '@agorio/plugin-approval-workflow';
import { createSpendingControlsPlugin } from '@agorio/plugin-spending-controls';
import { createAuditTrailPlugin } from '@agorio/plugin-audit-trail';
import { createAgentIdentityPlugin } from '@agorio/plugin-agent-identity';
import { createProcurementPlugin } from '@agorio/plugin-procurement';

const cloud = agorioCloud({ apiKey: process.env.AGORIO_API_KEY! });
const storage = new FileSessionStorage({ dir: './sessions' });

const plugins = () => [
  createAgentIdentityPlugin({
    organizationId: 'acme-corp',
    organizationName: 'Acme Corp',
    department: 'Procurement',
  }),
  createSpendingControlsPlugin({ perTransactionLimit: 5_000, dailyLimit: 25_000 }),
  createApprovalWorkflowPlugin({ requireApprovalAbove: 1_000 }),
  createAuditTrailPlugin({ output: 'callback', callback: shipToYourLog }),
  createProcurementPlugin({
    vendors: VENDORS,
    expenseCategories: ['office-supplies', 'it-equipment', 'furniture'],
    requirePoOnCheckout: true,
  }),
];

const findBestPrice = { name: 'find-best-price', description: '...', build: (ctx) =>
  new ShoppingAgent({ llm: claude, tracer: ctx.tracer, onLog: ctx.onLog, plugins: plugins() }) };
const requestApproval = { name: 'request-approval', description: '...', build: (ctx) =>
  new ShoppingAgent({
    llm: claude,
    tracer: ctx.tracer,
    onLog: ctx.onLog,
    plugins: plugins(),
    sessionStorage: storage,
    sessionId: 'po-2026-04829',  // survives process restart
  }) };
const checkoutAndTrack = { name: 'checkout-and-track', description: '...', build: (ctx) =>
  new ShoppingAgent({ llm: claude, tracer: ctx.tracer, onLog: ctx.onLog, plugins: plugins() }) };

const chain = new AgentChain()
  .add(findBestPrice)
  .add(requestApproval)
  .add(checkoutAndTrack);

const result = await chain.run(
  'Order 100 ergonomic chairs for the new procurement team',
  { tracer: cloud.tracer, onLog: cloud.onLog },
);`;

export default function ProcurementPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-16 space-y-16">
      <header className="text-center space-y-6">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-[var(--accent)]">
          v0.7 · B2B procurement
        </p>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight">
          $50k purchase orders that
          <br />
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--violet)] bg-clip-text text-transparent">
            survive human review
          </span>
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto">
          Build AI procurement agents that comparison-shop merchants, pause for human approval above
          your threshold, attach PO numbers, and stream the full audit trail to Agorio Cloud — all
          on a single composable SDK.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="https://github.com/Nolpak14/agorio/tree/main/examples/procurement"
            className="rounded-md bg-gradient-to-r from-[var(--accent)] to-[#00c8d4] text-black font-semibold px-5 py-2.5"
          >
            Try the demo locally
          </Link>
          <Link
            href="mailto:piotr.kaplon@outlook.com?subject=Agorio%20procurement%20design%20partner"
            className="rounded-md border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)] px-5 py-2.5"
          >
            Become a design partner →
          </Link>
        </div>
      </header>

      <section className="grid md:grid-cols-2 gap-6">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-2"
          >
            <h2 className="font-semibold text-lg">{f.title}</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">The whole demo, in code</h2>
        <p className="text-sm text-[var(--muted)] max-w-3xl">
          Sub-agents composed via{' '}
          <code className="font-mono text-[var(--accent)]">AgentChain</code>, governance plugins layered as
          middleware, session storage so a 24-hour approval wait doesn&apos;t lose the cart. This snippet runs
          on three local MockMerchants — clone the repo and{' '}
          <code className="font-mono text-[var(--accent)]">npx tsx examples/procurement/index.ts</code>.
        </p>
        <pre className="bg-[var(--code-bg)] border border-[var(--border)] rounded-xl p-6 text-xs leading-relaxed font-mono overflow-x-auto">
          {codeSample}
        </pre>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 space-y-4 text-center">
        <h2 className="text-2xl font-bold">Looking for a design partner</h2>
        <p className="text-sm text-[var(--muted)] max-w-2xl mx-auto">
          We&apos;re working with mid-market procurement teams ($50M–$500M ARR) frustrated with Coupa /
          Ariba pricing to build the reference implementation. Free Pro tier for 12 months, co-marketing
          on launch, and weekly access to the maintainer team.
        </p>
        <Link
          href="mailto:piotr.kaplon@outlook.com?subject=Agorio%20procurement%20design%20partner"
          className="inline-block rounded-md bg-gradient-to-r from-[var(--violet)] to-[#6d28d9] text-white font-semibold px-5 py-2.5"
        >
          Email Piotr →
        </Link>
      </section>

      <section className="text-center text-sm text-[var(--muted)] pt-8 border-t border-[var(--border)]">
        Open source on{' '}
        <Link href="https://github.com/Nolpak14/agorio" className="text-[var(--accent)] hover:underline">
          GitHub
        </Link>{' '}
        ·{' '}
        <Link href="https://www.npmjs.com/package/@agorio/sdk" className="text-[var(--accent)] hover:underline">
          @agorio/sdk
        </Link>{' '}
        ·{' '}
        <Link href="https://cloud.agorio.dev" className="text-[var(--accent)] hover:underline">
          cloud.agorio.dev
        </Link>
      </section>
    </main>
  );
}
