'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Demo Scenarios ───

interface DemoStep {
  type: 'thinking' | 'tool_call' | 'tool_result';
  content: string;
  tool?: string;
  delay: number; // ms after previous step
}

interface CartItem {
  name: string;
  price: string;
  qty: number;
}

interface DemoScenario {
  id: string;
  name: string;
  description: string;
  task: string;
  steps: DemoStep[];
  finalCart: CartItem[];
  orderId: string;
  orderTotal: string;
}

const SCENARIOS: DemoScenario[] = [
  {
    id: 'buy-headphones',
    name: 'Buy Headphones',
    description: 'Discover a merchant, search for headphones, and complete checkout.',
    task: 'Go to localhost:3456 and buy me wireless headphones. Ship to Jane Doe, 123 Main St, San Francisco, CA 94102, US.',
    steps: [
      { type: 'thinking', content: 'I need to discover the merchant first to see what they offer.', delay: 400 },
      { type: 'tool_call', tool: 'discover_merchant', content: '{ "domain": "localhost:3456" }', delay: 300 },
      { type: 'tool_result', tool: 'discover_merchant', content: '{ "merchant": "TechDirect", "protocol": "ucp", "capabilities": ["checkout", "products", "orders"] }', delay: 200 },
      { type: 'thinking', content: 'Merchant discovered. Now let me search for wireless headphones.', delay: 500 },
      { type: 'tool_call', tool: 'search_products', content: '{ "query": "wireless headphones" }', delay: 300 },
      { type: 'tool_result', tool: 'search_products', content: '{ "products": [{ "id": "prod_headphones", "name": "ProSound Wireless Headphones", "price": { "amount": "79.99", "currency": "USD" }, "inStock": true }], "total": 1 }', delay: 200 },
      { type: 'thinking', content: 'Found ProSound Wireless Headphones for $79.99. Let me add them to cart.', delay: 400 },
      { type: 'tool_call', tool: 'add_to_cart', content: '{ "productId": "prod_headphones", "quantity": 1 }', delay: 200 },
      { type: 'tool_result', tool: 'add_to_cart', content: '{ "success": true, "cart": { "items": 1, "subtotal": "$79.99" } }', delay: 150 },
      { type: 'tool_call', tool: 'initiate_checkout', content: '{}', delay: 300 },
      { type: 'tool_result', tool: 'initiate_checkout', content: '{ "sessionId": "sess_abc123", "subtotal": "$79.99", "shipping": [{ "id": "standard", "price": "$5.99" }] }', delay: 200 },
      { type: 'tool_call', tool: 'submit_shipping', content: '{ "name": "Jane Doe", "line1": "123 Main St", "city": "San Francisco", "state": "CA", "postalCode": "94102", "country": "US" }', delay: 200 },
      { type: 'tool_result', tool: 'submit_shipping', content: '{ "accepted": true, "method": "Standard Shipping", "estimatedDays": "5-7" }', delay: 150 },
      { type: 'tool_call', tool: 'submit_payment', content: '{ "paymentMethod": "card", "paymentToken": "tok_mock_success" }', delay: 300 },
      { type: 'tool_result', tool: 'submit_payment', content: '{ "orderId": "ord_7x9k2m", "status": "confirmed", "total": "$85.98" }', delay: 200 },
      { type: 'thinking', content: 'Order confirmed! Order ID: ord_7x9k2m. Total: $85.98 (including $5.99 standard shipping). Estimated delivery in 5-7 business days.', delay: 300 },
    ],
    finalCart: [{ name: 'ProSound Wireless Headphones', price: '$79.99', qty: 1 }],
    orderId: 'ord_7x9k2m',
    orderTotal: '$85.98',
  },
  {
    id: 'compare-prices',
    name: 'Compare Prices',
    description: 'Search two merchants and compare keyboard prices across stores.',
    task: 'Compare mechanical keyboard prices on TechDirect (localhost:3456) and GadgetWorld (localhost:3457). Buy from the cheapest.',
    steps: [
      { type: 'thinking', content: 'I need to discover both merchants first, then compare prices.', delay: 400 },
      { type: 'tool_call', tool: 'discover_merchant', content: '{ "domain": "localhost:3456" }', delay: 250 },
      { type: 'tool_result', tool: 'discover_merchant', content: '{ "merchant": "TechDirect", "protocol": "ucp" }', delay: 150 },
      { type: 'tool_call', tool: 'discover_merchant', content: '{ "domain": "localhost:3457" }', delay: 250 },
      { type: 'tool_result', tool: 'discover_merchant', content: '{ "merchant": "GadgetWorld", "protocol": "ucp" }', delay: 150 },
      { type: 'thinking', content: 'Both merchants discovered. Now comparing keyboard prices across both stores.', delay: 400 },
      { type: 'tool_call', tool: 'compare_prices', content: '{ "query": "mechanical keyboard" }', delay: 300 },
      { type: 'tool_result', tool: 'compare_prices', content: '{ "merchants": [{ "merchant": "localhost:3456", "products": [{ "name": "MechForce K1 Keyboard", "price": "$129.99" }] }, { "merchant": "localhost:3457", "products": [{ "name": "MechForce K1 Keyboard", "price": "$119.99" }] }] }', delay: 300 },
      { type: 'thinking', content: 'GadgetWorld has the keyboard for $119.99 vs TechDirect at $129.99. Switching to GadgetWorld to purchase.', delay: 500 },
      { type: 'tool_call', tool: 'switch_merchant', content: '{ "domain": "localhost:3457" }', delay: 200 },
      { type: 'tool_result', tool: 'switch_merchant', content: '{ "activeMerchant": "GadgetWorld (localhost:3457)" }', delay: 100 },
      { type: 'tool_call', tool: 'add_to_cart', content: '{ "productId": "prod_keyboard", "quantity": 1 }', delay: 200 },
      { type: 'tool_result', tool: 'add_to_cart', content: '{ "success": true, "cart": { "items": 1, "subtotal": "$119.99" } }', delay: 150 },
      { type: 'thinking', content: 'Added keyboard from GadgetWorld ($10 cheaper). Ready to checkout when you provide shipping details.', delay: 300 },
    ],
    finalCart: [{ name: 'MechForce K1 Keyboard', price: '$119.99', qty: 1 }],
    orderId: '',
    orderTotal: '$119.99',
  },
  {
    id: 'track-order',
    name: 'Track Order',
    description: 'Place an order, subscribe to webhooks, and receive shipping updates.',
    task: 'Buy a webcam from localhost:3456, then subscribe to shipping updates so I know when it arrives.',
    steps: [
      { type: 'thinking', content: 'Let me discover the merchant and find a webcam.', delay: 400 },
      { type: 'tool_call', tool: 'discover_merchant', content: '{ "domain": "localhost:3456" }', delay: 250 },
      { type: 'tool_result', tool: 'discover_merchant', content: '{ "merchant": "TechDirect", "protocol": "ucp" }', delay: 150 },
      { type: 'tool_call', tool: 'search_products', content: '{ "query": "webcam" }', delay: 250 },
      { type: 'tool_result', tool: 'search_products', content: '{ "products": [{ "id": "prod_webcam", "name": "ClearView Pro Webcam", "price": { "amount": "59.99", "currency": "USD" }, "inStock": true }] }', delay: 200 },
      { type: 'tool_call', tool: 'get_product_reviews', content: '{ "productId": "prod_webcam" }', delay: 250 },
      { type: 'tool_result', tool: 'get_product_reviews', content: '{ "averageRating": 4.2, "totalReviews": 5, "reviews": [{ "author": "Alex M.", "rating": 5, "title": "Excellent product" }] }', delay: 200 },
      { type: 'thinking', content: 'ClearView Pro Webcam: $59.99, rated 4.2/5 stars. Good reviews. Adding to cart.', delay: 400 },
      { type: 'tool_call', tool: 'add_to_cart', content: '{ "productId": "prod_webcam", "quantity": 1 }', delay: 200 },
      { type: 'tool_result', tool: 'add_to_cart', content: '{ "success": true }', delay: 100 },
      { type: 'tool_call', tool: 'initiate_checkout', content: '{}', delay: 250 },
      { type: 'tool_result', tool: 'initiate_checkout', content: '{ "sessionId": "sess_xyz789" }', delay: 150 },
      { type: 'tool_call', tool: 'apply_discount_code', content: '{ "code": "SAVE10" }', delay: 200 },
      { type: 'tool_result', tool: 'apply_discount_code', content: '{ "success": true, "discount": { "type": "percentage", "value": 10, "amount": "$6.00" }, "newSubtotal": "$53.99" }', delay: 200 },
      { type: 'tool_call', tool: 'submit_payment', content: '{ "paymentMethod": "card", "paymentToken": "tok_mock_success" }', delay: 300 },
      { type: 'tool_result', tool: 'submit_payment', content: '{ "orderId": "ord_w3b4cam", "status": "confirmed", "total": "$59.98" }', delay: 200 },
      { type: 'thinking', content: 'Order placed! Now subscribing to webhook updates for shipping tracking.', delay: 400 },
      { type: 'tool_call', tool: 'subscribe_order_updates', content: '{ "orderId": "ord_w3b4cam" }', delay: 300 },
      { type: 'tool_result', tool: 'subscribe_order_updates', content: '{ "subscribed": true, "orderId": "ord_w3b4cam", "status": "active" }', delay: 200 },
      { type: 'thinking', content: 'Done! Order ord_w3b4cam confirmed for $59.98 (10% discount applied). Webhook subscription active — you\'ll be notified when it ships and delivers.', delay: 300 },
    ],
    finalCart: [{ name: 'ClearView Pro Webcam', price: '$53.99', qty: 1 }],
    orderId: 'ord_w3b4cam',
    orderTotal: '$59.98',
  },
];

// ─── Tool color mapping ───

const TOOL_COLORS: Record<string, string> = {
  discover_merchant: 'var(--accent)',
  list_capabilities: 'var(--accent)',
  switch_merchant: 'var(--accent)',
  browse_products: 'var(--violet)',
  search_products: 'var(--violet)',
  get_product: 'var(--violet)',
  get_product_reviews: 'var(--violet)',
  compare_prices: 'var(--violet)',
  add_to_cart: 'var(--amber)',
  view_cart: 'var(--amber)',
  remove_from_cart: 'var(--amber)',
  apply_discount_code: 'var(--amber)',
  initiate_checkout: '#10B981',
  submit_shipping: '#10B981',
  submit_payment: '#10B981',
  get_order_status: '#10B981',
  subscribe_order_updates: '#10B981',
};

// ─── Main Playground Page ───

export default function PlaygroundPage() {
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario>(SCENARIOS[0]);
  const [visibleSteps, setVisibleSteps] = useState<DemoStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [visibleSteps, scrollToBottom]);

  const runDemo = useCallback(async () => {
    setIsRunning(true);
    setIsDone(false);
    setVisibleSteps([]);
    abortRef.current = false;

    for (const step of selectedScenario.steps) {
      if (abortRef.current) break;
      await new Promise((r) => setTimeout(r, step.delay));
      if (abortRef.current) break;
      setVisibleSteps((prev) => [...prev, step]);
    }

    setIsRunning(false);
    setIsDone(true);
  }, [selectedScenario]);

  const resetDemo = () => {
    abortRef.current = true;
    setIsRunning(false);
    setIsDone(false);
    setVisibleSteps([]);
  };

  const switchScenario = (scenario: DemoScenario) => {
    resetDemo();
    setSelectedScenario(scenario);
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="px-6 pt-8 pb-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <a href="/" className="font-bold text-lg font-mono tracking-tight hover:opacity-80 transition-opacity">
            <span className="text-[var(--accent)]">ag</span>orio
          </a>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--violet)] text-sm text-[var(--violet)]">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Playground
          </div>
        </div>
      </header>

      <div className="px-6 pb-20 max-w-7xl mx-auto">
        {/* Scenario Selector */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 animate-fade-up">
            Interactive Agent Demo
          </h1>
          <p className="text-[var(--muted)] mb-6 animate-fade-up delay-100">
            Watch a shopping agent reason, call tools, and complete purchases in real-time.
            Choose a scenario and hit Run.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => switchScenario(s)}
                className={`text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                  selectedScenario.id === s.id
                    ? 'border-[var(--accent)] bg-[var(--accent)]0a shadow-[0_0_20px_rgba(0,240,255,0.08)]'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-bright)]'
                }`}
              >
                <div className="font-semibold text-sm mb-1">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">{s.description}</div>
              </button>
            ))}
          </div>

          {/* Task Display + Run Button */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] font-mono text-sm text-[var(--fg-dim)]">
              <span className="text-[var(--muted)] mr-2">Task:</span>
              {selectedScenario.task}
            </div>
            <button
              onClick={isRunning ? resetDemo : runDemo}
              className={`px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 shrink-0 cursor-pointer ${
                isRunning
                  ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]'
              }`}
              style={
                isRunning
                  ? {}
                  : { background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }
              }
            >
              {isRunning ? 'Stop' : isDone ? 'Run Again' : 'Run Agent'}
            </button>
          </div>
        </div>

        {/* Main Content: Steps + Sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Agent Steps Panel */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--code-bg)] overflow-hidden">
              {/* Terminal bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]" style={{ background: 'var(--terminal-bar)' }}>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
                </div>
                <span className="text-xs text-[var(--muted)] font-mono ml-2">agent-output</span>
                {isRunning && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--accent)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-status-pulse" />
                    running
                  </span>
                )}
                {isDone && (
                  <span className="ml-auto text-xs text-emerald-400">
                    complete
                  </span>
                )}
              </div>

              {/* Steps */}
              <div className="p-4 min-h-[400px] max-h-[600px] overflow-y-auto font-mono text-sm space-y-2">
                {visibleSteps.length === 0 && !isRunning && (
                  <div className="text-[var(--muted)] text-center py-20">
                    Click &quot;Run Agent&quot; to start the demo
                  </div>
                )}
                {visibleSteps.map((step, i) => (
                  <StepLine key={i} step={step} />
                ))}
                <div ref={stepsEndRef} />
              </div>
            </div>
          </div>

          {/* Sidebar: Cart + Order */}
          <div className="space-y-4">
            {/* Cart Panel */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--amber)]" />
                Cart
              </h3>
              {isDone && selectedScenario.finalCart.length > 0 ? (
                <div className="space-y-2">
                  {selectedScenario.finalCart.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[var(--fg-dim)]">
                        {item.name} <span className="text-[var(--muted)]">x{item.qty}</span>
                      </span>
                      <span className="text-[var(--accent)] font-mono">{item.price}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--muted)]">
                  {isRunning ? 'Updating...' : 'Empty'}
                </div>
              )}
            </div>

            {/* Order Panel */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />
                Order
              </h3>
              {isDone && selectedScenario.orderId ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Order ID</span>
                    <span className="font-mono text-[var(--accent)]">{selectedScenario.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Status</span>
                    <span className="text-emerald-400">confirmed</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Total</span>
                    <span className="font-mono font-semibold">{selectedScenario.orderTotal}</span>
                  </div>
                </div>
              ) : isDone && !selectedScenario.orderId ? (
                <div className="text-sm text-[var(--muted)]">
                  Cart ready (checkout not completed in this demo)
                </div>
              ) : (
                <div className="text-sm text-[var(--muted)]">
                  {isRunning ? 'Processing...' : 'No order yet'}
                </div>
              )}
            </div>

            {/* Stats Panel */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--violet)]" />
                Agent Stats
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[var(--muted)] text-xs">Steps</div>
                  <div className="font-mono font-bold text-lg">{visibleSteps.length}</div>
                </div>
                <div>
                  <div className="text-[var(--muted)] text-xs">Tool Calls</div>
                  <div className="font-mono font-bold text-lg">
                    {visibleSteps.filter((s) => s.type === 'tool_call').length}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--muted)] text-xs">Unique Tools</div>
                  <div className="font-mono font-bold text-lg">
                    {new Set(visibleSteps.filter((s) => s.tool).map((s) => s.tool)).size}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--muted)] text-xs">Status</div>
                  <div className={`font-mono font-bold text-lg ${isDone ? 'text-emerald-400' : isRunning ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
                    {isDone ? 'Done' : isRunning ? 'Running' : 'Idle'}
                  </div>
                </div>
              </div>
            </div>

            {/* Code CTA */}
            <a
              href="https://github.com/Nolpak14/agorio#quick-start"
              className="block text-center px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--accent)] hover:border-[var(--accent)] transition-all duration-200"
              target="_blank"
              rel="noopener"
            >
              Build your own agent &rarr;
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Step Line Component ───

function StepLine({ step }: { step: DemoStep }) {
  const color = step.tool ? TOOL_COLORS[step.tool] || 'var(--muted)' : 'var(--fg-dim)';

  if (step.type === 'thinking') {
    return (
      <div className="animate-fade-up flex gap-2 py-1">
        <span className="text-[var(--muted)] shrink-0">[Think]</span>
        <span className="text-[var(--fg-dim)]">{step.content}</span>
      </div>
    );
  }

  if (step.type === 'tool_call') {
    return (
      <div className="animate-fade-up flex gap-2 py-1">
        <span className="shrink-0" style={{ color }}>
          [Tool]
        </span>
        <span>
          <span style={{ color }} className="font-semibold">{step.tool}</span>
          <span className="text-[var(--muted)]">(</span>
          <span className="text-[var(--fg-dim)]">{step.content}</span>
          <span className="text-[var(--muted)]">)</span>
        </span>
      </div>
    );
  }

  // tool_result
  return (
    <div className="animate-fade-up flex gap-2 py-1 pl-4 border-l-2 ml-2" style={{ borderColor: color + '33' }}>
      <span className="text-[var(--muted)] shrink-0">&rarr;</span>
      <span className="text-[var(--fg-dim)] break-all">{step.content}</span>
    </div>
  );
}
