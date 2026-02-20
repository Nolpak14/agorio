'use client';

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
    <section className="relative overflow-hidden">
      {/* Gradient mesh background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 40%, rgba(0, 240, 255, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 30%, rgba(139, 92, 246, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 50% 80%, rgba(0, 240, 255, 0.04) 0%, transparent 60%)
          `,
        }}
      />

      <div className="relative px-6 pt-28 pb-24 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            {/* Version badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] text-sm text-[var(--muted)] mb-8 animate-fade-up animate-pulse-glow">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-status-pulse" />
              v0.3 — UCP + ACP + MCP · CLI · Plugins · 4 LLMs
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold leading-[1.1] tracking-tight mb-6 animate-fade-up delay-100">
              Build AI commerce agents in{' '}
              <span
                className="text-transparent bg-clip-text animate-gradient"
                style={{
                  backgroundImage: 'linear-gradient(135deg, var(--accent), var(--violet), var(--accent))',
                  backgroundSize: '200% 200%',
                }}
              >
                20 lines of code
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg text-[var(--fg-dim)] mb-10 leading-relaxed animate-fade-up delay-200">
              The open-source TypeScript toolkit for building AI agents that
              discover merchants, browse products, and complete purchases — using
              the{' '}
              <a
                href="https://github.com/Universal-Commerce-Protocol/ucp"
                className="text-[var(--fg)] underline underline-offset-4 decoration-[var(--border)] hover:decoration-[var(--accent)] transition-colors"
                target="_blank"
                rel="noopener"
              >
                UCP
              </a>{' '}
              and{' '}
              <a
                href="https://github.com/agentic-commerce-protocol/agentic-commerce-protocol"
                className="text-[var(--fg)] underline underline-offset-4 decoration-[var(--border)] hover:decoration-[var(--accent)] transition-colors"
                target="_blank"
                rel="noopener"
              >
                ACP
              </a>{' '}
              open protocols.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 animate-fade-up delay-300">
              <div className="install-cmd flex items-center gap-2 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg font-mono text-sm">
                <span className="text-[var(--accent)]">$</span>
                <span>npm install @agorio/sdk</span>
              </div>

              <a
                href="https://github.com/Nolpak14/agorio"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm text-black transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), #00c8d4)',
                }}
                target="_blank"
                rel="noopener"
              >
                GitHub
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
              </a>

              <a
                href="https://www.npmjs.com/package/@agorio/sdk"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] hover:border-[var(--accent)] rounded-lg text-sm transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,240,255,0.1)]"
                target="_blank"
                rel="noopener"
              >
                npm
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
              </a>
            </div>
          </div>

          {/* Code block */}
          <div className="animate-fade-up delay-400">
            <CodeBlock code={heroCode} filename="agent.ts" />
          </div>
        </div>
      </div>
    </section>
  );
}
