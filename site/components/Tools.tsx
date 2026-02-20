'use client';

import { useEffect, useRef, useState } from 'react';

const stages = [
  {
    name: 'Discovery',
    color: 'var(--accent)',
    tools: [
      { name: 'discover_merchant', desc: 'Auto-detect UCP or ACP merchant by domain', glyph: 'D' },
      { name: 'list_capabilities', desc: 'List what the merchant supports', glyph: 'C' },
    ],
  },
  {
    name: 'Shopping',
    color: 'var(--violet)',
    tools: [
      { name: 'browse_products', desc: 'Paginated catalog with filtering', glyph: 'B' },
      { name: 'search_products', desc: 'Keyword search across products', glyph: 'S' },
      { name: 'get_product', desc: 'Detailed product info with variants', glyph: 'P' },
    ],
  },
  {
    name: 'Cart',
    color: 'var(--amber)',
    tools: [
      { name: 'add_to_cart', desc: 'Add products with quantity selection', glyph: '+' },
      { name: 'view_cart', desc: 'View cart contents and subtotal', glyph: '=' },
      { name: 'remove_from_cart', desc: 'Remove items from cart', glyph: '-' },
    ],
  },
  {
    name: 'Checkout',
    color: '#10B981',
    tools: [
      { name: 'initiate_checkout', desc: 'Start checkout, get shipping options', glyph: '>' },
      { name: 'submit_shipping', desc: 'Submit shipping address', glyph: '@' },
      { name: 'submit_payment', desc: 'Complete payment, receive order', glyph: '$' },
      { name: 'get_order_status', desc: 'Check status of an existing order', glyph: '#' },
    ],
  },
];

export default function Tools() {
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

  let toolIndex = 0;

  return (
    <section ref={ref} className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className={`text-3xl font-bold text-center mb-4 ${visible ? 'animate-fade-up' : 'opacity-0'}`}>
        12 Built-in Shopping Tools
      </h2>
      <p className={`text-center text-[var(--muted)] mb-14 max-w-2xl mx-auto ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        Every tool the agent needs for the full shopping workflow — UCP and ACP,
        from discovery to order tracking. Need more?{' '}
        <a
          href="https://github.com/Nolpak14/agorio#add-custom-tools-with-plugins"
          className="text-[var(--accent)] hover:underline"
          target="_blank"
          rel="noopener"
        >
          Add custom tools with plugins
        </a>.
      </p>

      <div className="space-y-10">
        {stages.map((stage) => (
          <div key={stage.name}>
            <div className="flex items-center gap-3 mb-4">
              <span
                className="stage-badge px-2.5 py-1 rounded-md border"
                style={{ color: stage.color, borderColor: stage.color + '33' , backgroundColor: stage.color + '0a' }}
              >
                {stage.name}
              </span>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${stage.color}22, transparent)` }} />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stage.tools.map((tool) => {
                const idx = toolIndex++;
                return (
                  <div
                    key={tool.name}
                    className={`card-hover flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] ${visible ? 'animate-fade-up' : 'opacity-0'}`}
                    style={{ animationDelay: `${(idx + 2) * 60}ms` }}
                  >
                    <span
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold font-mono shrink-0"
                      style={{
                        color: stage.color,
                        backgroundColor: stage.color + '15',
                        border: `1px solid ${stage.color}25`,
                      }}
                    >
                      {tool.glyph}
                    </span>
                    <div>
                      <code className="text-sm font-mono text-[var(--accent)]">
                        {tool.name}
                      </code>
                      <p className="text-xs text-[var(--muted)] mt-1">{tool.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
