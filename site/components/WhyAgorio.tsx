'use client';

import { useEffect, useRef, useState } from 'react';

const comparisons = [
  {
    capability: 'Merchant discovery',
    scratch: 'Parse /.well-known/ucp yourself, handle ACP endpoints separately, detect protocol',
    agorio: 'Auto-detects UCP or ACP per merchant',
  },
  {
    capability: 'Product search',
    scratch: 'Build REST client, handle pagination, parse responses',
    agorio: 'Built-in agent tool, automatic',
  },
  {
    capability: 'Cart & checkout flow',
    scratch: 'Manage sessions, shipping, payment state machine',
    agorio: '12 tools handle the full flow',
  },
  {
    capability: 'LLM integration',
    scratch: 'Write provider-specific function calling code',
    agorio: 'Swap adapters: Gemini, Claude, OpenAI',
  },
  {
    capability: 'Testing',
    scratch: 'Stand up your own mock server, write fixtures',
    agorio: 'MockMerchant (UCP) + MockAcpMerchant (ACP)',
  },
  {
    capability: 'Agent orchestration',
    scratch: 'Implement plan-act-observe from scratch',
    agorio: 'agent.run("buy me headphones")',
  },
];

export default function WhyAgorio() {
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
    <section ref={ref} className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className={`text-3xl font-bold text-center mb-4 ${visible ? 'animate-fade-up' : 'opacity-0'}`}>
        Why Agorio
      </h2>
      <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        Stop rebuilding commerce plumbing. Focus on what makes your agent unique.
      </p>

      <div className={`overflow-x-auto ${visible ? 'animate-fade-up delay-200' : 'opacity-0'}`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-3 px-4 text-[var(--muted)] font-medium text-xs uppercase tracking-wider">
                Capability
              </th>
              <th className="text-left py-3 px-4 text-[var(--muted)] font-medium text-xs uppercase tracking-wider">
                Building from Scratch
              </th>
              <th className="text-left py-3 px-4 text-[var(--accent)] font-medium text-xs uppercase tracking-wider">
                With Agorio
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((row, i) => (
              <tr
                key={row.capability}
                className={`border-b border-[var(--border)] hover:bg-[var(--card)] transition-colors ${visible ? 'animate-fade-up' : 'opacity-0'}`}
                style={{ animationDelay: `${(i + 3) * 80}ms` }}
              >
                <td className="py-3.5 px-4 font-medium">{row.capability}</td>
                <td className="py-3.5 px-4 text-[var(--muted)]">{row.scratch}</td>
                <td className="py-3.5 px-4">
                  <code className="text-[var(--accent)] bg-[var(--code-bg)] px-2 py-0.5 rounded text-xs font-mono">
                    {row.agorio}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
