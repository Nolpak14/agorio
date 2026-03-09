'use client';

import { useEffect, useRef, useState } from 'react';

// Simulated agent steps for the mini-demo
const DEMO_STEPS = [
  { type: 'thinking', tool: null, text: 'I need to discover the merchant and find headphones.' },
  { type: 'tool_call', tool: 'discover_merchant', text: '{ "domain": "mock-merchant.agorio.dev" }' },
  { type: 'tool_result', tool: 'discover_merchant', text: '{ "merchant": "TechShop", "protocol": "ucp" }' },
  { type: 'tool_call', tool: 'search_products', text: '{ "query": "headphones" }' },
  { type: 'tool_result', tool: 'search_products', text: '{ "products": [{ "name": "ProSound Wireless", "price": "$149.99" }] }' },
  { type: 'tool_call', tool: 'add_to_cart', text: '{ "productId": "prod_wireless_headphones" }' },
  { type: 'tool_result', tool: 'add_to_cart', text: '{ "cart": { "items": 1, "subtotal": "$149.99" } }' },
  { type: 'tool_call', tool: 'initiate_checkout', text: '{}' },
  { type: 'tool_result', tool: 'initiate_checkout', text: '{ "sessionId": "sess_a1b2c3" }' },
  { type: 'tool_call', tool: 'submit_payment', text: '{ "paymentToken": "tok_mock_success" }' },
  { type: 'tool_result', tool: 'submit_payment', text: '{ "orderId": "ord_x7k9m2", "status": "confirmed" }' },
  { type: 'thinking', tool: null, text: 'Order confirmed! Total: $155.98 including shipping.' },
];

const TOOL_COLORS: Record<string, string> = {
  discover_merchant: '#00f0ff',
  search_products: '#8b5cf6',
  add_to_cart: '#f59e0b',
  initiate_checkout: '#10B981',
  submit_payment: '#10B981',
};

export default function PlaygroundPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          setIsAnimating(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isAnimating) return;
    if (activeStep >= DEMO_STEPS.length) {
      // Loop after a pause
      const timeout = setTimeout(() => {
        setActiveStep(0);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    const delay = DEMO_STEPS[activeStep].type === 'thinking' ? 1200 : DEMO_STEPS[activeStep].type === 'tool_call' ? 500 : 400;
    const timeout = setTimeout(() => setActiveStep((s) => s + 1), delay);
    return () => clearTimeout(timeout);
  }, [activeStep, isAnimating]);

  const visibleSteps = DEMO_STEPS.slice(0, activeStep);

  return (
    <section ref={ref} className="px-6 py-24 max-w-6xl mx-auto">
      <div className={`text-center mb-12 ${visible ? 'animate-fade-up' : 'opacity-0'}`}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm mb-6" style={{ borderColor: 'var(--violet)', color: 'var(--violet)' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Interactive Playground
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
          See the agent in action — <span style={{ color: 'var(--accent)' }}>right in your browser</span>
        </h2>
        <p className="text-[var(--muted)] max-w-2xl mx-auto">
          No API keys, no setup. Type any shopping task and watch the agent discover merchants,
          search products, compare prices, and complete checkout in real time.
        </p>
      </div>

      <div className={`${visible ? 'animate-fade-up delay-200' : 'opacity-0'}`}>
        {/* Mini demo preview */}
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--card)' }}>
          {/* Top bar mimicking playground */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)]">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm font-mono" style={{ background: 'var(--code-bg)', color: 'var(--muted)' }}>
              Buy me wireless headphones and track shipping
            </div>
            <div className="px-3 py-1.5 rounded-lg text-sm font-medium text-black" style={{ background: 'linear-gradient(135deg, #00f0ff, #00c8d4)' }}>
              Run
            </div>
          </div>

          <div className="grid md:grid-cols-3">
            {/* Agent output */}
            <div className="md:col-span-2 p-5 font-mono text-xs leading-relaxed space-y-1 min-h-[280px]" style={{ background: 'var(--code-bg)' }}>
              {visibleSteps.map((step, i) => {
                const color = step.tool ? TOOL_COLORS[step.tool] || '#6b7280' : 'var(--fg-dim)';
                if (step.type === 'thinking') {
                  return (
                    <div key={i} className="animate-fade-up flex gap-2 py-0.5">
                      <span style={{ color: '#6b7280' }}>[Think]</span>
                      <span style={{ color: 'var(--fg-dim)' }}>{step.text}</span>
                    </div>
                  );
                }
                if (step.type === 'tool_call') {
                  return (
                    <div key={i} className="animate-fade-up flex gap-2 py-0.5">
                      <span style={{ color }}>[Tool]</span>
                      <span>
                        <span style={{ color }} className="font-semibold">{step.tool}</span>
                        <span style={{ color: '#6b7280' }}>(</span>
                        <span style={{ color: 'var(--fg-dim)' }}>{step.text}</span>
                        <span style={{ color: '#6b7280' }}>)</span>
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={i} className="animate-fade-up flex gap-2 py-0.5 pl-4 border-l-2 ml-2" style={{ borderColor: color + '33' }}>
                    <span style={{ color: '#6b7280' }}>&rarr;</span>
                    <span style={{ color: 'var(--fg-dim)' }}>{step.text}</span>
                  </div>
                );
              })}
              {activeStep < DEMO_STEPS.length && isAnimating && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-status-pulse" style={{ background: '#00f0ff' }} />
                  <span style={{ color: '#6b7280' }}>running...</span>
                </div>
              )}
              {visibleSteps.length === 0 && !isAnimating && (
                <div className="text-center py-16" style={{ color: '#6b7280' }}>
                  Waiting for task...
                </div>
              )}
            </div>

            {/* Sidebar preview */}
            <div className="border-l border-[var(--border)] p-5 space-y-4">
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />
                  Cart
                </h4>
                {activeStep > 6 ? (
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--fg-dim)' }}>ProSound Wireless</span>
                      <span className="font-mono" style={{ color: '#00f0ff' }}>$149.99</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: '#6b7280' }}>Empty</div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
                  Order
                </h4>
                {activeStep >= DEMO_STEPS.length ? (
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span style={{ color: '#6b7280' }}>ID</span>
                      <span className="font-mono" style={{ color: '#00f0ff' }}>ord_x7k9m2</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: '#6b7280' }}>Status</span>
                      <span className="text-emerald-400">confirmed</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: '#6b7280' }}>No order yet</div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }} />
                  Stats
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div style={{ color: '#6b7280' }}>Steps</div>
                    <div className="font-mono font-bold">{visibleSteps.length}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280' }}>Tools</div>
                    <div className="font-mono font-bold">{visibleSteps.filter((s) => s.type === 'tool_call').length}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className={`text-center mt-8 ${visible ? 'animate-fade-up delay-300' : 'opacity-0'}`}>
          <a
            href="/playground"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, var(--violet), #6d28d9)',
              color: 'white',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Open the Playground
          </a>
          <p className="text-sm text-[var(--muted)] mt-4">
            No API keys required. Runs entirely in your browser.
          </p>
        </div>
      </div>
    </section>
  );
}
