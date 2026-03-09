'use client';

import { useEffect, useRef, useState } from 'react';
import CodeBlock from './CodeBlock';

const features = [
  {
    title: 'Multi-Merchant',
    desc: 'Discover multiple merchants, compare prices across stores, and maintain isolated carts per merchant.',
    color: 'var(--accent)',
    code: `const result = await agent.run(
  'Compare headphone prices on TechDirect and GadgetWorld'
);
// Agent discovers both, searches each, returns comparison
// Each merchant gets its own cart, checkout, and order state`,
  },
  {
    title: 'Shopify Adapter',
    desc: 'Connect to real Shopify stores via the Storefront API. Auto-detected by domain, zero config.',
    color: 'var(--violet)',
    code: `import { ShoppingAgent, ShopifyAdapter } from '@agorio/sdk';

const agent = new ShoppingAgent({
  llm: adapter,
  adapters: [new ShopifyAdapter({
    storeDomain: 'my-store.myshopify.com',
    storefrontToken: process.env.SHOPIFY_TOKEN,
  })],
});`,
  },
  {
    title: 'Webhooks',
    desc: 'Subscribe to order lifecycle events. Get notified when orders ship and deliver via HMAC-signed callbacks.',
    color: 'var(--amber)',
    code: `import { WebhookServer } from '@agorio/sdk';

const webhooks = new WebhookServer({
  secret: 'my-hmac-secret',
  onOrderUpdate: (event) => {
    console.log(event.orderId, event.newStatus);
    // "ord_123" "shipped" | "delivered"
  },
});
await webhooks.start();`,
  },
  {
    title: 'Observability',
    desc: 'Structured logging, OpenTelemetry-compatible tracing, and automatic usage metrics for every run.',
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
        New in v0.4
      </h2>
      <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        Multi-merchant price comparison, real Shopify connectivity, webhook order tracking, and a browser playground.
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
