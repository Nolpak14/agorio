import CodeBlock from './CodeBlock';

const heroCode = `import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@agorio/sdk';

const merchant = new MockMerchant();
await merchant.start();

const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
});

const result = await agent.run(
  \`Go to \${merchant.domain} and buy me wireless headphones\`
);

console.log(result.answer);
console.log(result.checkout?.orderId);

await merchant.stop();`;

export default function Hero() {
  return (
    <section className="px-6 pt-24 pb-20 max-w-6xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] text-sm text-[var(--muted)] mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            v0.2 — Gemini, Claude, OpenAI
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight mb-6">
            Build AI commerce agents in{' '}
            <span className="text-[var(--accent)]">20 lines of code</span>
          </h1>

          <p className="text-lg text-[var(--muted)] mb-8 leading-relaxed">
            The open-source TypeScript toolkit for building AI agents that
            discover merchants, browse products, and complete purchases — using
            the{' '}
            <a
              href="https://github.com/Universal-Commerce-Protocol/ucp"
              className="text-[var(--fg)] underline underline-offset-2"
              target="_blank"
              rel="noopener"
            >
              UCP
            </a>{' '}
            and{' '}
            <a
              href="https://github.com/agentic-commerce-protocol/agentic-commerce-protocol"
              className="text-[var(--fg)] underline underline-offset-2"
              target="_blank"
              rel="noopener"
            >
              ACP
            </a>{' '}
            open protocols.
          </p>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg font-mono text-sm">
              <span className="text-[var(--muted)]">$</span>
              <span>npm install @agorio/sdk</span>
            </div>

            <a
              href="https://github.com/Nolpak14/agorio"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium text-sm transition-colors"
              target="_blank"
              rel="noopener"
            >
              GitHub
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
            </a>

            <a
              href="https://www.npmjs.com/package/@agorio/sdk"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] hover:border-[var(--muted)] rounded-lg text-sm transition-colors"
              target="_blank"
              rel="noopener"
            >
              npm
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
            </a>
          </div>
        </div>

        <div>
          <CodeBlock code={heroCode} filename="agent.ts" />
        </div>
      </div>
    </section>
  );
}
