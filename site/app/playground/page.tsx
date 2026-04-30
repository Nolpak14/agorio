'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───

type Provider = 'openai' | 'gemini' | 'claude';

interface AgentEvent {
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'done' | 'error';
  iteration: number;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  result?: {
    answer: string;
    steps: unknown[];
    checkout?: { orderId: string; status: string; items: unknown[] };
  };
  error?: string;
  timestamp: number;
}

// A chat message is either a user bubble or an agent turn (with tool steps + answer)
interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  // For user messages
  text?: string;
  // For agent messages
  toolSteps?: ToolStep[];
  answer?: string;
  isStreaming?: boolean;
}

interface ToolStep {
  type: 'tool_call' | 'tool_result' | 'thinking';
  tool?: string;
  content: string;
}

interface CartItem {
  name: string;
  price: number;
  qty: number;
}

interface OrderInfo {
  id: string;
  status: string;
  total: number;
}

// ─── Provider Config ───

const PROVIDERS: { id: Provider; name: string; placeholder: string; icon: string }[] = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', icon: 'O' },
  { id: 'gemini', name: 'Gemini', placeholder: 'AIza...', icon: 'G' },
  { id: 'claude', name: 'Claude', placeholder: 'sk-ant-...', icon: 'C' },
];

// ─── Tool colors ───

const TOOL_COLORS: Record<string, string> = {
  discover_merchant: '#00f0ff', switch_merchant: '#00f0ff',
  list_capabilities: '#00f0ff',
  browse_products: '#8b5cf6', search_products: '#8b5cf6',
  get_product: '#8b5cf6', get_product_reviews: '#8b5cf6',
  compare_prices: '#8b5cf6',
  add_to_cart: '#f59e0b', view_cart: '#f59e0b',
  remove_from_cart: '#f59e0b', apply_discount_code: '#f59e0b',
  initiate_checkout: '#10B981', submit_shipping: '#10B981',
  submit_payment: '#10B981', get_order_status: '#10B981',
  subscribe_order_updates: '#10B981',
};

// ─── Suggestions ───

const SUGGESTIONS = [
  { label: 'Browse the catalog', intent: 'browse' },
  { label: 'Search for keyboards', intent: 'search' },
  { label: 'Buy me wireless headphones', intent: 'buy' },
  { label: 'What electronics do you have under $100?', intent: 'search' },
  { label: 'Compare the webcam and the monitor light', intent: 'compare' },
  { label: 'Find a USB hub and buy it', intent: 'buy' },
];

// ─── Helpers ───

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
    .replace(/\*(.+?)\*/g, '$1')            // italic
    .replace(/__(.+?)__/g, '$1')            // bold alt
    .replace(/_(.+?)_/g, '$1')              // italic alt
    .replace(/`(.+?)`/g, '$1')              // inline code
    .replace(/^#{1,6}\s+/gm, '')            // headings
    .replace(/^[-*]\s+/gm, '• ')            // list items
    .replace(/^\d+\.\s+/gm, '')             // numbered lists
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')     // links
    .replace(/\n{3,}/g, '\n\n')             // excess newlines
    .trim();
}

function parsePrice(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return parseFloat(String(obj.amount ?? obj.value ?? 0)) || 0;
  }
  return 0;
}

function msgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// Products available in the playground store
const STORE_PRODUCTS = [
  { name: 'ProSound Wireless Headphones', price: '$149.99', category: 'Electronics' },
  { name: 'ErgoRise Laptop Stand', price: '$59.99', category: 'Accessories' },
  { name: 'TypePro Mechanical Keyboard', price: '$89.99', category: 'Electronics' },
  { name: 'ConnectAll USB-C Hub', price: '$39.99', category: 'Accessories' },
  { name: 'ClearView 4K Webcam', price: '$79.99', category: 'Electronics' },
  { name: 'WorkPad XL Desk Mat', price: '$29.99', category: 'Accessories' },
  { name: 'GlowBar Monitor Light', price: '$44.99', category: 'Lighting' },
  { name: 'TidyDesk Cable Organizer', price: '$12.99', category: 'Accessories' },
  { name: 'SilentClick Bluetooth Mouse', price: '$34.99', category: 'Electronics', outOfStock: true },
  { name: 'FastCharge Qi Pad', price: '$24.99', category: 'Accessories' },
] as const;

// ─── SSE Client ───

async function runAgentStream(
  message: string,
  sessionId: string | null,
  provider: Provider,
  apiKey: string,
  model: string | undefined,
  onEvent: (event: AgentEvent) => void,
  onSessionId: (id: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/playground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, provider, apiKey, model: model || undefined }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'session' && parsed.sessionId) {
            onSessionId(parsed.sessionId);
          } else {
            onEvent(parsed as AgentEvent);
          }
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

// ─── Main Page ───

export default function PlaygroundPage() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session ID for persistent agent state
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Provider config
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showConfig, setShowConfig] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textAccRef = useRef('');
  const lastAnswerRef = useRef('');
  const agentMsgIdRef = useRef('');

  // Load saved config
  useEffect(() => {
    try {
      const saved = localStorage.getItem('agorio-playground-config');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.provider) setProvider(config.provider);
        if (config.apiKey) { setApiKey(config.apiKey); setShowConfig(false); }
        if (config.model) setModel(config.model);
      }
    } catch { /* ignore */ }
  }, []);

  // Save config changes
  const saveConfig = useCallback(() => {
    try {
      localStorage.setItem('agorio-playground-config', JSON.stringify({ provider, apiKey, model }));
    } catch { /* ignore */ }
  }, [provider, apiKey, model]);

  useEffect(() => { saveConfig(); }, [saveConfig]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input after agent completes
  useEffect(() => {
    if (!isRunning) inputRef.current?.focus();
  }, [isRunning]);

  const handleSend = useCallback(async (text?: string) => {
    const msgText = text || inputText.trim();
    if (!msgText) return;

    if (!apiKey.trim()) {
      setShowConfig(true);
      setError('Please enter your API key first');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Add user message
    const userMsg: ChatMessage = { id: msgId(), role: 'user', text: msgText };
    const agentId = msgId();
    agentMsgIdRef.current = agentId;
    const agentMsg: ChatMessage = { id: agentId, role: 'agent', toolSteps: [], isStreaming: true };

    setMessages(prev => [...prev, userMsg, agentMsg]);
    setIsRunning(true);
    setError(null);
    setInputText('');
    textAccRef.current = '';
    lastAnswerRef.current = '';

    // Track product names from search results to fix cart display
    const productNames: Record<string, string> = {};

    const updateAgent = (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages(prev => prev.map(m => m.id === agentId ? updater(m) : m));
    };

    const handleEvent = (event: AgentEvent) => {
      switch (event.type) {
        case 'text_delta':
          textAccRef.current += event.text || '';
          updateAgent(m => ({
            ...m,
            answer: stripMarkdown(textAccRef.current),
          }));
          break;

        case 'tool_call':
          textAccRef.current = '';
          updateAgent(m => ({
            ...m,
            answer: undefined,
            toolSteps: [...(m.toolSteps || []), {
              type: 'tool_call',
              tool: event.toolName,
              content: JSON.stringify(event.toolInput || {}, null, 0),
            }],
          }));
          break;

        case 'tool_result': {
          const output = typeof event.toolOutput === 'string'
            ? event.toolOutput
            : JSON.stringify(event.toolOutput ?? '', null, 0);
          updateAgent(m => ({
            ...m,
            toolSteps: [...(m.toolSteps || []), {
              type: 'tool_result',
              tool: event.toolName,
              content: output.slice(0, 500),
            }],
          }));

          // Capture product names from search/browse results
          if ((event.toolName === 'search_products' || event.toolName === 'browse_products') && event.toolOutput) {
            const searchOut = event.toolOutput as Record<string, unknown>;
            if (Array.isArray(searchOut.products)) {
              for (const p of searchOut.products) {
                const prod = p as Record<string, unknown>;
                if (prod.id && prod.name) {
                  productNames[String(prod.id)] = String(prod.name);
                }
              }
            }
          }

          // Extract cart/order info
          if (event.toolName === 'add_to_cart' && event.toolOutput) {
            const out = event.toolOutput as Record<string, unknown>;
            const cartData = (out.cart ?? out) as Record<string, unknown>;
            if (Array.isArray(cartData.items)) {
              setCart(cartData.items.map((item: Record<string, unknown>) => {
                const pid = String(item.productId || item.id || '');
                const rawName = String(item.name || '');
                // Use captured display name, or fall back to raw name, or product ID
                const displayName = productNames[pid] || productNames[rawName]
                  || (rawName.startsWith('prod_') ? undefined : rawName)
                  || STORE_PRODUCTS.find(p => pid.includes(p.name.toLowerCase().replace(/\s+/g, '_')))?.name
                  || pid.replace(/^prod_/, '').replace(/_/g, ' ');
                // Use price from search results if cart returns 0
                const price = parsePrice(item.price);
                const searchProduct = STORE_PRODUCTS.find(p =>
                  pid.includes(p.name.toLowerCase().replace(/\s+/g, '_')) ||
                  p.name.toLowerCase().includes(pid.replace(/^prod_/, '').replace(/_/g, ' '))
                );
                return {
                  name: displayName,
                  price: price > 0 ? price : (searchProduct ? parseFloat(searchProduct.price.replace('$', '')) : 0),
                  qty: Number(item.quantity || 1),
                };
              }));
            }
          }
          if ((event.toolName === 'submit_payment' || event.toolName === 'initiate_checkout') && event.toolOutput) {
            const out = event.toolOutput as Record<string, unknown>;
            if (out.orderId) {
              const orderObj = (out.order ?? out) as Record<string, unknown>;
              setOrder({
                id: String(out.orderId),
                status: String(out.status || 'confirmed'),
                total: parsePrice(orderObj.total),
              });
            }
          }
          break;
        }

        case 'done':
          if (event.result) {
            const answer = stripMarkdown(event.result.answer);
            lastAnswerRef.current = answer;
            updateAgent(m => ({ ...m, answer, isStreaming: false }));
            if (event.result.checkout) {
              setOrder({
                id: event.result.checkout.orderId,
                status: event.result.checkout.status,
                total: 0,
              });
            }
          } else {
            updateAgent(m => ({ ...m, isStreaming: false }));
          }
          break;

        case 'error':
          updateAgent(m => ({
            ...m,
            answer: `Error: ${event.error || 'Unknown error'}`,
            isStreaming: false,
          }));
          break;
      }
    };

    try {
      await runAgentStream(
        msgText,
        sessionId,
        provider,
        apiKey,
        model || undefined,
        handleEvent,
        (id) => setSessionId(id),
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
        updateAgent(m => ({ ...m, answer: `Error: ${(err as Error).message}`, isStreaming: false }));
      }
    }

    if (!controller.signal.aborted) {
      updateAgent(m => ({ ...m, isStreaming: false }));
      setIsRunning(false);
    }
  }, [inputText, provider, apiKey, model, sessionId]);

  const handleStop = () => {
    abortRef.current?.abort();
    setMessages(prev => prev.map(m =>
      m.id === agentMsgIdRef.current ? { ...m, isStreaming: false } : m
    ));
    setIsRunning(false);
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setCart([]);
    setOrder(null);
    setSessionId(null);
    setIsRunning(false);
    setError(null);
    setInputText('');
    textAccRef.current = '';
    lastAnswerRef.current = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isRunning) handleSend();
  };

  const toolCallCount = messages
    .filter(m => m.role === 'agent')
    .reduce((sum, m) => sum + (m.toolSteps?.filter(s => s.type === 'tool_call').length || 0), 0);

  return (
    <main className="min-h-screen flex flex-col pt-14">
      {/* Header */}
      <header className="px-6 pt-4 pb-3 max-w-6xl w-full mx-auto flex items-center justify-between shrink-0">
        <a href="/" className="font-bold text-lg font-mono tracking-tight hover:opacity-80 transition-opacity">
          <span style={{ color: '#00f0ff' }}>ag</span>orio
        </a>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-bright)] transition-all cursor-pointer"
            >
              New chat
            </button>
          )}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all cursor-pointer hover:opacity-80"
            style={{
              borderColor: apiKey ? '#10B981' : '#f59e0b',
              color: apiKey ? '#10B981' : '#f59e0b',
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: apiKey ? '#10B981' : '#f59e0b' }} />
            {apiKey ? `${PROVIDERS.find(p => p.id === provider)?.name}` : 'Set API Key'}
          </button>
        </div>
      </header>

      {/* Config Panel */}
      {showConfig && (
        <div className="px-6 max-w-6xl w-full mx-auto shrink-0">
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 animate-fade-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm mb-1">LLM Provider</h3>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  Your API key is sent to our server only to proxy LLM calls. It is never stored.
                </p>
              </div>
              {apiKey && (
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--border-bright)] transition-colors cursor-pointer"
                  style={{ color: '#6b7280' }}
                >
                  Close
                </button>
              )}
            </div>
            <div className="flex gap-2 mb-4">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setModel(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                    provider === p.id
                      ? 'border-[var(--accent)] text-[var(--fg)]'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-bright)]'
                  }`}
                  style={provider === p.id ? { borderColor: '#00f0ff', background: 'rgba(0,240,255,0.05)' } : {}}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: provider === p.id ? '#00f0ff' : 'var(--border)',
                      color: provider === p.id ? '#000' : 'var(--muted)',
                    }}>
                    {p.icon}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={PROVIDERS.find(p => p.id === provider)?.placeholder}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] font-mono text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Model (optional)"
                className="w-48 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] font-mono text-xs text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
            {error && !isRunning && (
              <p className="text-xs text-red-400 mt-2">{error}</p>
            )}
          </div>
        </div>
      )}

      {/* Chat area — grows to fill remaining space */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_280px] gap-6">
            {/* Messages */}
            <div className="flex flex-col min-h-0">
              {/* Empty state */}
              {messages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-10">
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">Agent Playground</h1>
                  <p className="text-[var(--muted)] mb-6 text-sm text-center max-w-md">
                    Chat with a real ShoppingAgent powered by your LLM. It talks to a live mock merchant via UCP.
                  </p>

                  {/* Product catalog */}
                  <div className="w-full max-w-lg mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
                      Available in the store
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {STORE_PRODUCTS.map(p => (
                        <div key={p.name} className="flex justify-between text-xs py-0.5">
                          <span style={{ color: ('outOfStock' in p && p.outOfStock) ? '#6b7280' : 'var(--fg-dim)' }}>
                            {p.name}
                            {('outOfStock' in p && p.outOfStock) && <span className="ml-1 text-red-400">(sold out)</span>}
                          </span>
                          <span className="font-mono ml-2 shrink-0" style={{ color: '#00f0ff' }}>{p.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggestions */}
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {SUGGESTIONS.map(s => {
                      const intentColor = s.intent === 'buy' ? '#10B981' : s.intent === 'search' ? '#8b5cf6' : s.intent === 'compare' ? '#f59e0b' : '#00f0ff';
                      return (
                        <button
                          key={s.label}
                          onClick={() => { setInputText(s.label); handleSend(s.label); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-bright)] transition-all cursor-pointer"
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: intentColor }} />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chat messages */}
              {messages.length > 0 && (
                <div className="space-y-4 py-4">
                  {messages.map(msg => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Sidebar — only show when there's activity */}
            {messages.length > 0 && (
              <div className="hidden lg:block space-y-4 py-4">
                {/* Cart */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <h3 className="font-semibold text-xs mb-2 flex items-center gap-2 uppercase tracking-wider" style={{ color: '#6b7280' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                    Cart
                  </h3>
                  {cart.length > 0 ? (
                    <div className="space-y-1.5">
                      {cart.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span style={{ color: 'var(--fg-dim)' }}>{item.name} x{item.qty}</span>
                          <span className="font-mono" style={{ color: '#00f0ff' }}>${item.price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: '#6b7280' }}>{isRunning ? 'Updating...' : 'Empty'}</p>
                  )}
                </div>

                {/* Order */}
                {order && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <h3 className="font-semibold text-xs mb-2 flex items-center gap-2 uppercase tracking-wider" style={{ color: '#6b7280' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />
                      Order
                    </h3>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span style={{ color: '#6b7280' }}>ID</span>
                        <span className="font-mono" style={{ color: '#00f0ff' }}>{order.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: '#6b7280' }}>Status</span>
                        <span className="text-emerald-400">{order.status}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <h3 className="font-semibold text-xs mb-2 flex items-center gap-2 uppercase tracking-wider" style={{ color: '#6b7280' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
                    Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div style={{ color: '#6b7280' }}>Messages</div>
                      <div className="font-mono font-bold">{messages.filter(m => m.role === 'user').length}</div>
                    </div>
                    <div>
                      <div style={{ color: '#6b7280' }}>Tool Calls</div>
                      <div className="font-mono font-bold">{toolCallCount}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input bar — pinned to bottom */}
      <div className="shrink-0 border-t border-[var(--border)] px-6 py-4" style={{ background: 'var(--bg)' }}>
        <div className="max-w-6xl mx-auto lg:pr-[calc(280px+1.5rem)]">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={messages.length > 0 ? "Send a follow-up..." : "What would you like to buy?"}
              disabled={isRunning}
              className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] font-mono text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            />
            <button
              onClick={isRunning ? handleStop : () => handleSend()}
              disabled={!isRunning && !inputText.trim()}
              className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-200 shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isRunning
                  ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]'
              }`}
              style={isRunning ? {} : { background: 'linear-gradient(135deg, #00f0ff, #00c8d4)' }}
            >
              {isRunning ? 'Stop' : 'Send'}
            </button>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: '#4b5563' }}>
            Powered by @agorio/sdk — real ShoppingAgent + MockMerchant via UCP
          </p>
        </div>
      </div>
    </main>
  );
}

// ─── Chat Bubble ───

function ChatBubble({ message }: { message: ChatMessage }) {
  const [showTools, setShowTools] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md text-sm"
          style={{ background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.2)' }}>
          {message.text}
        </div>
      </div>
    );
  }

  // Agent message
  const toolSteps = message.toolSteps || [];
  const toolCallSteps = toolSteps.filter(s => s.type === 'tool_call');
  const hasTools = toolCallSteps.length > 0;

  return (
    <div className="flex justify-start animate-fade-up">
      <div className="max-w-[85%] space-y-2">
        {/* Tool activity indicator / expander */}
        {hasTools && (
          <button
            onClick={() => setShowTools(!showTools)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-bright)] transition-all cursor-pointer"
            style={{ color: '#6b7280' }}
          >
            <svg className={`w-3 h-3 transition-transform ${showTools ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>
              {message.isStreaming ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00f0ff' }} />
                  Using tools...
                </span>
              ) : (
                `Used ${toolCallSteps.length} tool${toolCallSteps.length !== 1 ? 's' : ''}: ${toolCallSteps.map(s => s.tool).filter(Boolean).join(', ')}`
              )}
            </span>
          </button>
        )}

        {/* Expanded tool details */}
        {showTools && (
          <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--code-bg)' }}>
            <div className="p-3 space-y-1 font-mono text-xs max-h-[300px] overflow-y-auto">
              {toolSteps.map((step, i) => (
                <ToolStepLine key={i} step={step} />
              ))}
            </div>
          </div>
        )}

        {/* Agent answer */}
        {message.answer && (
          <div className="px-4 py-3 rounded-2xl rounded-bl-md text-sm leading-relaxed"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            {message.answer}
          </div>
        )}

        {/* Streaming indicator when no answer yet */}
        {message.isStreaming && !message.answer && !hasTools && (
          <div className="px-4 py-3 rounded-2xl rounded-bl-md text-sm"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <span className="flex items-center gap-2" style={{ color: '#6b7280' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00f0ff' }} />
              Thinking...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool Step Line ───

function ToolStepLine({ step }: { step: ToolStep }) {
  const color = step.tool ? TOOL_COLORS[step.tool] || '#6b7280' : '#6b7280';

  if (step.type === 'tool_call') {
    return (
      <div className="flex gap-2 py-0.5">
        <span className="shrink-0" style={{ color }}>{step.tool}</span>
        <span style={{ color: '#6b7280' }}>{step.content}</span>
      </div>
    );
  }

  if (step.type === 'tool_result') {
    return (
      <div className="flex gap-2 py-0.5 pl-3 border-l border-[var(--border)]">
        <span style={{ color: '#6b7280' }}>{step.content}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 py-0.5" style={{ color: '#6b7280' }}>
      {step.content}
    </div>
  );
}
