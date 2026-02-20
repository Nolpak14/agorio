'use client';

import { useEffect, useRef, useState } from 'react';
import CodeBlock from './CodeBlock';

const quickStartCode = `import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@agorio/sdk';

// 1. Start a mock merchant (UCP-compliant test server)
const merchant = new MockMerchant({ name: 'TechShop' });
await merchant.start();

// 2. Create an agent with your LLM of choice
const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
  verbose: true,
  onStep: (step) => {
    if (step.type === 'tool_call') {
      console.log(\`Calling \${step.toolName}...\`);
    }
  },
});

// 3. Give it a task
const result = await agent.run(
  \`Go to \${merchant.domain} and buy me a mechanical keyboard.
   Ship to: Jane Doe, 123 Main St, San Francisco, CA 94102, US\`
);

// 4. Inspect the result
console.log(result.success);            // true
console.log(result.answer);             // Natural language summary
console.log(result.checkout?.orderId);   // "ord_..."
console.log(result.checkout?.total);     // { amount: "95.98", currency: "USD" }

await merchant.stop();`;

export default function QuickStart() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="px-6 py-20 max-w-4xl mx-auto">
      <h2 className={`text-3xl font-bold text-center mb-4 ${visible ? 'animate-fade-up' : 'opacity-0'}`}>
        Quick Start
      </h2>
      <p className={`text-center text-[var(--muted)] mb-10 ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        From zero to a working shopping agent in under a minute.
      </p>

      <div className={`space-y-4 ${visible ? 'animate-fade-up delay-200' : 'opacity-0'}`}>
        <div className="install-cmd flex items-center gap-3 px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl font-mono text-sm">
          <span className="text-[var(--accent)]">$</span>
          <span>npm install @agorio/sdk</span>
        </div>

        <CodeBlock code={quickStartCode} filename="my-agent.ts" />
      </div>

      <p className={`text-center text-sm text-[var(--muted)] mt-8 ${visible ? 'animate-fade-up delay-300' : 'opacity-0'}`}>
        See the full{' '}
        <a
          href="https://github.com/Nolpak14/agorio#quick-start"
          className="text-[var(--accent)] hover:underline"
          target="_blank"
          rel="noopener"
        >
          README
        </a>{' '}
        for UcpClient usage, mock merchant config, and more.
      </p>
    </section>
  );
}
