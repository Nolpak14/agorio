'use client';

import { useEffect, useRef, useState } from 'react';
import CodeBlock from './CodeBlock';

const features = [
  {
    title: 'CLI Tool',
    desc: 'Scaffold projects, start mock merchants, and discover capabilities from the command line.',
    color: 'var(--accent)',
    code: `$ npx agorio init my-agent
$ npx agorio mock --mcp --port 3456
$ npx agorio discover localhost:3456`,
  },
  {
    title: 'MCP Transport',
    desc: 'Automatic JSON-RPC 2.0 transport detection. MCP when available, REST fallback. Zero config.',
    color: 'var(--violet)',
    code: `// Auto-detects MCP or REST — no changes needed
const client = new UcpClient();
await client.discover('shop.example.com');
const products = await client.callApi('/products');
// Works over MCP (JSON-RPC) or REST automatically`,
  },
  {
    title: 'Plugin System',
    desc: 'Extend the agent with custom tools beyond the built-in 12. Async handlers with JSON Schema.',
    color: 'var(--amber)',
    code: `const agent = new ShoppingAgent({
  llm: adapter,
  plugins: [{
    name: 'check_price_history',
    description: 'Check price trends',
    parameters: { type: 'object', properties: {
      productId: { type: 'string' }
    }},
    handler: async ({ productId }) => fetchPrices(productId),
  }],
});`,
  },
  {
    title: 'Observability',
    desc: 'Structured logging, OpenTelemetry-compatible tracing, and automatic usage metrics.',
    color: '#10B981',
    code: `const result = await agent.run('Buy headphones');
console.log(result.usage?.totalTokens);    // 4521
console.log(result.usage?.llmCalls);        // 6
console.log(result.usage?.toolCalls);       // 8
console.log(result.usage?.totalLatencyMs);  // 3200`,
  },
];

export default function Features() {
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
        New in v0.3
      </h2>
      <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        MCP transport, plugin extensibility, production observability, and a developer CLI.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {features.map((f, i) => (
          <div
            key={f.title}
            className={`card-hover p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] ${visible ? 'animate-fade-up' : 'opacity-0'}`}
            style={{ animationDelay: `${(i + 2) * 100}ms` }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 30px rgba(0,0,0,0.3), 0 0 20px ${f.color}15`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '';
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: f.color }}
              />
              <h3 className="font-semibold text-lg">{f.title}</h3>
            </div>
            <p className="text-sm text-[var(--muted)] mb-4">{f.desc}</p>
            <CodeBlock code={f.code} filename={f.title === 'CLI Tool' ? 'terminal' : 'example.ts'} />
          </div>
        ))}
      </div>
    </section>
  );
}
