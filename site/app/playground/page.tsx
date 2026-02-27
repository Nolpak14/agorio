'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── In-Browser Product Catalog (mirrors MockMerchant fixtures) ───

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  inStock: boolean;
}

const CATALOG: Product[] = [
  { id: 'prod_wireless_headphones', name: 'ProSound Wireless Headphones', description: 'Premium noise-cancelling wireless headphones with 40-hour battery life, Bluetooth 5.3, and adaptive EQ.', price: 149.99, category: 'Electronics', inStock: true },
  { id: 'prod_laptop_stand', name: 'ErgoRise Laptop Stand', description: 'Adjustable aluminum laptop stand with ventilation. Fits 10-17 inch laptops.', price: 59.99, category: 'Accessories', inStock: true },
  { id: 'prod_mechanical_keyboard', name: 'TypePro Mechanical Keyboard', description: 'Hot-swappable mechanical keyboard with RGB backlighting and PBT keycaps.', price: 89.99, category: 'Electronics', inStock: true },
  { id: 'prod_usb_hub', name: 'ConnectAll USB-C Hub', description: '7-in-1 USB-C hub with HDMI 4K, 3x USB-A, SD reader, and 100W PD.', price: 39.99, category: 'Accessories', inStock: true },
  { id: 'prod_webcam', name: 'ClearView 4K Webcam', description: '4K webcam with auto-focus, dual microphones, and privacy shutter.', price: 79.99, category: 'Electronics', inStock: true },
  { id: 'prod_desk_mat', name: 'WorkPad XL Desk Mat', description: 'Extra-large desk mat (35x17\") with anti-slip base and water-resistant surface.', price: 29.99, category: 'Accessories', inStock: true },
  { id: 'prod_monitor_light', name: 'GlowBar Monitor Light', description: 'LED monitor light bar with auto-dimming and adjustable color temperature.', price: 44.99, category: 'Lighting', inStock: true },
  { id: 'prod_cable_organizer', name: 'TidyDesk Cable Organizer', description: 'Silicone cable management clips, set of 5. Adhesive-backed.', price: 12.99, category: 'Accessories', inStock: true },
  { id: 'prod_bluetooth_mouse', name: 'SilentClick Bluetooth Mouse', description: 'Ergonomic wireless mouse with silent clicks, 4000 DPI sensor.', price: 34.99, category: 'Electronics', inStock: false },
  { id: 'prod_phone_charger', name: 'FastCharge Qi Pad', description: '15W fast wireless charger with LED indicator. All Qi devices.', price: 24.99, category: 'Accessories', inStock: true },
];

// ─── Agent Step Types ───

interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  tool?: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

interface OrderInfo {
  id: string;
  status: string;
  total: number;
  items: CartItem[];
}

// ─── Client-Side Agent Engine ───

function searchProducts(query: string): Product[] {
  const q = query.toLowerCase();
  return CATALOG.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
  );
}

function findProductByKeywords(task: string): Product | null {
  const t = task.toLowerCase();
  // Try specific product keywords first
  const keywords: Array<[string[], string]> = [
    [['headphone', 'headset', 'earphone'], 'prod_wireless_headphones'],
    [['keyboard', 'keeb', 'mechanical'], 'prod_mechanical_keyboard'],
    [['webcam', 'camera', 'cam'], 'prod_webcam'],
    [['mouse', 'mice'], 'prod_bluetooth_mouse'],
    [['laptop stand', 'stand'], 'prod_laptop_stand'],
    [['usb hub', 'hub', 'usb-c', 'dongle'], 'prod_usb_hub'],
    [['desk mat', 'mat', 'mousepad'], 'prod_desk_mat'],
    [['monitor light', 'light bar', 'lamp'], 'prod_monitor_light'],
    [['cable', 'organizer'], 'prod_cable_organizer'],
    [['charger', 'wireless charger', 'qi'], 'prod_phone_charger'],
  ];
  for (const [kws, id] of keywords) {
    for (const kw of kws) {
      if (t.includes(kw)) return CATALOG.find((p) => p.id === id) || null;
    }
  }
  return null;
}

function extractShippingFromTask(task: string): {
  name: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
} | null {
  // Look for common patterns like "ship to Name, Address, City, ST ZIP"
  const m = task.match(
    /ship(?:.*?)to\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*),\s*(.+?),\s*([A-Za-z ]+),?\s+([A-Z]{2})\s+(\d{5})/i
  );
  if (m) return { name: m[1], line1: m[2], city: m[3], state: m[4], postalCode: m[5], country: 'US' };
  return null;
}

type StepEmitter = (step: AgentStep) => Promise<void>;

async function runAgent(
  task: string,
  emit: StepEmitter,
  setCart: (c: CartItem[]) => void,
  setOrder: (o: OrderInfo | null) => void,
  signal: AbortSignal
): Promise<void> {
  const t = task.toLowerCase();
  const cart: CartItem[] = [];
  const merchant = 'mock-merchant.agorio.dev';
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
    });

  const check = () => { if (signal.aborted) throw new Error('aborted'); };

  // ── Step 1: Discover merchant ──
  await emit({ type: 'thinking', content: `I need to discover the merchant and understand what they offer.` });
  await delay(400); check();

  await emit({ type: 'tool_call', tool: 'discover_merchant', content: `{ "domain": "${merchant}" }` });
  await delay(300); check();
  await emit({ type: 'tool_result', tool: 'discover_merchant', content: `{ "merchant": "Agorio TechShop", "protocol": "ucp", "capabilities": ["checkout", "products", "orders", "reviews", "discounts", "webhooks"] }` });
  await delay(200); check();

  // ── Determine intent ──
  const wantsBuy = /buy|purchase|order|get me|checkout/i.test(t);
  const wantsBrowse = /browse|show|list|catalog|what do you (have|sell)/i.test(t);
  const wantsSearch = wantsBuy || /search|find|look for|looking for/i.test(t);
  const wantsReview = /review|rating|rated/i.test(t);
  const wantsDiscount = /discount|coupon|code|promo|SAVE/i.test(t);
  const wantsTrack = /track|webhook|notify|shipping update|subscribe/i.test(t);
  const wantsCompare = /compare|cheapest|vs|versus/i.test(t);

  // ── Browse catalog ──
  if (wantsBrowse && !wantsSearch) {
    await emit({ type: 'thinking', content: `Let me browse the full product catalog.` });
    await delay(300); check();
    await emit({ type: 'tool_call', tool: 'browse_products', content: `{ "page": 1, "limit": 10 }` });
    await delay(300); check();
    const productList = CATALOG.map((p) => `${p.name} — $${p.price.toFixed(2)}${p.inStock ? '' : ' (out of stock)'}`).join(', ');
    await emit({ type: 'tool_result', tool: 'browse_products', content: `{ "products": [${CATALOG.slice(0, 5).map((p) => `{ "id": "${p.id}", "name": "${p.name}", "price": "$${p.price.toFixed(2)}" }`).join(', ')}], "total": ${CATALOG.length} }` });
    await delay(200); check();
    await emit({ type: 'thinking', content: `Found ${CATALOG.length} products: ${productList}. What would you like?` });
    return;
  }

  // ── Price comparison (multi-merchant simulation) ──
  if (wantsCompare) {
    const product = findProductByKeywords(t);
    const searchTerm = product?.name.split(' ').slice(-1)[0] || 'headphones';
    const results = searchProducts(searchTerm);

    await emit({ type: 'thinking', content: `The user wants to compare prices. Let me discover a second merchant and search both.` });
    await delay(400); check();

    await emit({ type: 'tool_call', tool: 'discover_merchant', content: `{ "domain": "gadgetworld.agorio.dev" }` });
    await delay(250); check();
    await emit({ type: 'tool_result', tool: 'discover_merchant', content: `{ "merchant": "GadgetWorld", "protocol": "ucp" }` });
    await delay(200); check();

    await emit({ type: 'tool_call', tool: 'compare_prices', content: `{ "query": "${searchTerm}" }` });
    await delay(400); check();

    const basePrice = results[0]?.price ?? 149.99;
    const gwPrice = +(basePrice * 0.92).toFixed(2);
    await emit({ type: 'tool_result', tool: 'compare_prices', content: `{ "merchants": [{ "merchant": "${merchant}", "products": [{ "name": "${results[0]?.name || 'Product'}", "price": "$${basePrice.toFixed(2)}" }] }, { "merchant": "gadgetworld.agorio.dev", "products": [{ "name": "${results[0]?.name || 'Product'}", "price": "$${gwPrice.toFixed(2)}" }] }] }` });
    await delay(300); check();

    const cheaper = gwPrice < basePrice ? 'gadgetworld.agorio.dev' : merchant;
    const cheaperName = cheaper === merchant ? 'Agorio TechShop' : 'GadgetWorld';
    const cheaperPrice = Math.min(basePrice, gwPrice);

    await emit({ type: 'thinking', content: `${cheaperName} has the better price at $${cheaperPrice.toFixed(2)} (saves $${Math.abs(basePrice - gwPrice).toFixed(2)}). Switching to that merchant.` });
    await delay(300); check();

    await emit({ type: 'tool_call', tool: 'switch_merchant', content: `{ "domain": "${cheaper}" }` });
    await delay(200); check();
    await emit({ type: 'tool_result', tool: 'switch_merchant', content: `{ "activeMerchant": "${cheaperName} (${cheaper})" }` });
    await delay(150); check();

    if (wantsBuy && results[0]) {
      const item: CartItem = { id: results[0].id, name: results[0].name, price: cheaperPrice, qty: 1 };
      cart.push(item);
      setCart([...cart]);
      await emit({ type: 'tool_call', tool: 'add_to_cart', content: `{ "productId": "${item.id}", "quantity": 1 }` });
      await delay(200); check();
      await emit({ type: 'tool_result', tool: 'add_to_cart', content: `{ "success": true, "cart": { "items": 1, "subtotal": "$${cheaperPrice.toFixed(2)}" } }` });
      await delay(150); check();
      await emit({ type: 'thinking', content: `Added ${item.name} from ${cheaperName} to cart for $${cheaperPrice.toFixed(2)}.` });
    } else {
      await emit({ type: 'thinking', content: `Price comparison complete. ${cheaperName} has the best price. Let me know if you want to buy!` });
    }
    return;
  }

  // ── Search for product ──
  const targetProduct = findProductByKeywords(t);
  let selectedProduct: Product | null = null;

  if (targetProduct) {
    await emit({ type: 'thinking', content: `The user is looking for ${targetProduct.name}. Let me search for it.` });
    await delay(300); check();

    const searchTerm = targetProduct.name.split(' ').pop() || targetProduct.name;
    await emit({ type: 'tool_call', tool: 'search_products', content: `{ "query": "${searchTerm}" }` });
    await delay(300); check();

    const results = searchProducts(searchTerm);
    await emit({ type: 'tool_result', tool: 'search_products', content: `{ "products": [${results.map((p) => `{ "id": "${p.id}", "name": "${p.name}", "price": { "amount": "${p.price.toFixed(2)}", "currency": "USD" }, "inStock": ${p.inStock} }`).join(', ')}], "total": ${results.length} }` });
    await delay(200); check();

    selectedProduct = targetProduct;

    if (!selectedProduct.inStock) {
      await emit({ type: 'thinking', content: `Unfortunately, ${selectedProduct.name} is currently out of stock. Would you like me to look for alternatives?` });
      return;
    }

    await emit({ type: 'thinking', content: `Found ${selectedProduct.name} for $${selectedProduct.price.toFixed(2)}. It's in stock.` });
    await delay(200); check();
  } else if (wantsSearch || wantsBuy) {
    // Generic search — grab first word that looks like a product
    const words = t.replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3 && !['with', 'from', 'that', 'this', 'want', 'need', 'please', 'ship', 'find', 'search', 'look'].includes(w));
    const searchQ = words.slice(0, 2).join(' ') || 'electronics';

    await emit({ type: 'thinking', content: `Let me search for "${searchQ}" in the catalog.` });
    await delay(300); check();
    await emit({ type: 'tool_call', tool: 'search_products', content: `{ "query": "${searchQ}" }` });
    await delay(300); check();

    const results = searchProducts(searchQ);
    if (results.length > 0) {
      selectedProduct = results[0];
      await emit({ type: 'tool_result', tool: 'search_products', content: `{ "products": [${results.slice(0, 3).map((p) => `{ "id": "${p.id}", "name": "${p.name}", "price": { "amount": "${p.price.toFixed(2)}", "currency": "USD" }, "inStock": ${p.inStock} }`).join(', ')}], "total": ${results.length} }` });
      await delay(200); check();
      await emit({ type: 'thinking', content: `Found ${results.length} result${results.length > 1 ? 's' : ''}. Best match: ${selectedProduct.name} at $${selectedProduct.price.toFixed(2)}.` });
    } else {
      await emit({ type: 'tool_result', tool: 'search_products', content: `{ "products": [], "total": 0 }` });
      await delay(200); check();
      await emit({ type: 'thinking', content: `No results for "${searchQ}". Let me browse the catalog to find something close.` });
      await delay(300); check();
      await emit({ type: 'tool_call', tool: 'browse_products', content: `{ "page": 1, "limit": 5 }` });
      await delay(300); check();
      selectedProduct = CATALOG[0];
      await emit({ type: 'tool_result', tool: 'browse_products', content: `{ "products": [${CATALOG.slice(0, 5).map((p) => `{ "id": "${p.id}", "name": "${p.name}", "price": "$${p.price.toFixed(2)}" }`).join(', ')}], "total": ${CATALOG.length} }` });
      await delay(200); check();
      await emit({ type: 'thinking', content: `Here are the available products. Top pick: ${selectedProduct.name} at $${selectedProduct.price.toFixed(2)}.` });
    }
    await delay(200); check();
  }

  if (!selectedProduct) {
    await emit({ type: 'thinking', content: `I'm not sure what you're looking for. Try asking me to "buy headphones", "search for keyboards", "browse the catalog", or "compare prices on webcams".` });
    return;
  }

  // ── Reviews ──
  if (wantsReview) {
    await emit({ type: 'tool_call', tool: 'get_product_reviews', content: `{ "productId": "${selectedProduct.id}" }` });
    await delay(300); check();
    const rating = (3.8 + (selectedProduct.price % 1)).toFixed(1);
    await emit({ type: 'tool_result', tool: 'get_product_reviews', content: `{ "productId": "${selectedProduct.id}", "averageRating": ${rating}, "totalReviews": 23, "reviews": [{ "author": "Alex M.", "rating": 5, "title": "Excellent quality", "body": "Exactly what I needed. Great build quality." }, { "author": "Sam K.", "rating": 4, "title": "Good value", "body": "Works well for the price." }] }` });
    await delay(200); check();
    await emit({ type: 'thinking', content: `${selectedProduct.name} is rated ${rating}/5 with 23 reviews. Generally positive feedback about quality and value.` });
    await delay(200); check();
  }

  if (!wantsBuy) {
    await emit({ type: 'thinking', content: `Found what you're looking for. Want me to buy it? Just say "buy ${selectedProduct.name.split(' ').pop()?.toLowerCase()}".` });
    return;
  }

  // ── Add to cart ──
  const item: CartItem = { id: selectedProduct.id, name: selectedProduct.name, price: selectedProduct.price, qty: 1 };
  cart.push(item);
  setCart([...cart]);

  await emit({ type: 'tool_call', tool: 'add_to_cart', content: `{ "productId": "${selectedProduct.id}", "quantity": 1 }` });
  await delay(200); check();
  await emit({ type: 'tool_result', tool: 'add_to_cart', content: `{ "success": true, "cart": { "items": 1, "subtotal": "$${selectedProduct.price.toFixed(2)}" } }` });
  await delay(200); check();

  // ── Checkout ──
  await emit({ type: 'thinking', content: `Added to cart. Starting checkout process.` });
  await delay(300); check();

  await emit({ type: 'tool_call', tool: 'initiate_checkout', content: `{}` });
  await delay(300); check();
  const sessionId = `sess_${Math.random().toString(36).slice(2, 8)}`;
  await emit({ type: 'tool_result', tool: 'initiate_checkout', content: `{ "sessionId": "${sessionId}", "subtotal": "$${selectedProduct.price.toFixed(2)}", "shipping": [{ "id": "standard", "name": "Standard", "price": "$5.99", "estimatedDays": "5-7" }, { "id": "express", "name": "Express", "price": "$12.99", "estimatedDays": "2-3" }] }` });
  await delay(200); check();

  // ── Discount ──
  let finalPrice = selectedProduct.price;
  if (wantsDiscount) {
    const codeMatch = t.match(/\b(SAVE\d+|WELCOME|FREESHIP)\b/i);
    const code = codeMatch ? codeMatch[1].toUpperCase() : 'SAVE10';
    const discountPct = code === 'SAVE20' ? 0.20 : code === 'WELCOME' ? 0.15 : 0.10;
    const discountAmt = +(finalPrice * discountPct).toFixed(2);
    finalPrice = +(finalPrice - discountAmt).toFixed(2);

    await emit({ type: 'tool_call', tool: 'apply_discount_code', content: `{ "code": "${code}" }` });
    await delay(250); check();
    await emit({ type: 'tool_result', tool: 'apply_discount_code', content: `{ "success": true, "code": "${code}", "discount": { "type": "percentage", "value": ${discountPct * 100}, "amount": "$${discountAmt.toFixed(2)}" }, "newSubtotal": "$${finalPrice.toFixed(2)}" }` });
    await delay(200); check();
    await emit({ type: 'thinking', content: `Discount ${code} applied! Saved $${discountAmt.toFixed(2)}. New subtotal: $${finalPrice.toFixed(2)}.` });
    await delay(200); check();
    cart[0].price = finalPrice;
    setCart([...cart]);
  }

  // ── Shipping ──
  const shipping = extractShippingFromTask(task);
  if (shipping) {
    await emit({ type: 'tool_call', tool: 'submit_shipping', content: JSON.stringify(shipping) });
    await delay(250); check();
    await emit({ type: 'tool_result', tool: 'submit_shipping', content: `{ "accepted": true, "method": "Standard Shipping", "estimatedDays": "5-7" }` });
    await delay(150); check();
  } else {
    await emit({ type: 'tool_call', tool: 'submit_shipping', content: `{ "name": "Demo User", "line1": "123 Commerce St", "city": "San Francisco", "state": "CA", "postalCode": "94102", "country": "US" }` });
    await delay(250); check();
    await emit({ type: 'tool_result', tool: 'submit_shipping', content: `{ "accepted": true, "method": "Standard Shipping", "estimatedDays": "5-7" }` });
    await delay(150); check();
  }

  // ── Payment ──
  const total = +(finalPrice + 5.99).toFixed(2);
  await emit({ type: 'tool_call', tool: 'submit_payment', content: `{ "paymentMethod": "card", "paymentToken": "tok_mock_success" }` });
  await delay(350); check();
  const orderId = `ord_${Math.random().toString(36).slice(2, 8)}`;
  await emit({ type: 'tool_result', tool: 'submit_payment', content: `{ "orderId": "${orderId}", "status": "confirmed", "total": "$${total.toFixed(2)}" }` });
  await delay(200); check();

  const order: OrderInfo = { id: orderId, status: 'confirmed', total, items: [...cart] };
  setOrder(order);

  // ── Webhook subscription ──
  if (wantsTrack) {
    await emit({ type: 'thinking', content: `Order placed! Now subscribing to shipping updates via webhooks.` });
    await delay(300); check();
    await emit({ type: 'tool_call', tool: 'subscribe_order_updates', content: `{ "orderId": "${orderId}" }` });
    await delay(300); check();
    await emit({ type: 'tool_result', tool: 'subscribe_order_updates', content: `{ "subscribed": true, "orderId": "${orderId}", "status": "active" }` });
    await delay(200); check();
    await emit({ type: 'thinking', content: `Done! Order ${orderId} confirmed for $${total.toFixed(2)} (incl. $5.99 shipping). Webhook subscription active — you'll be notified when it ships and delivers.` });
  } else {
    await emit({ type: 'thinking', content: `Order confirmed! Order ID: ${orderId}. Total: $${total.toFixed(2)} (subtotal $${finalPrice.toFixed(2)} + $5.99 shipping). Estimated delivery in 5-7 business days.` });
  }
}

// ─── Suggested tasks ───

const SUGGESTIONS = [
  'Buy me wireless headphones',
  'Search for a mechanical keyboard and show reviews',
  'Compare webcam prices across merchants',
  'Browse the full catalog',
  'Buy a desk mat with discount code SAVE10',
  'Find a USB hub, buy it, and track shipping',
];

// ─── Tool color mapping ───

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

// ─── Main Playground Page ───

export default function PlaygroundPage() {
  const [taskInput, setTaskInput] = useState('');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const handleRun = useCallback(async (task?: string) => {
    const taskText = task || taskInput.trim();
    if (!taskText) return;

    // Reset state
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSteps([]);
    setCart([]);
    setOrder(null);
    setIsRunning(true);
    setIsDone(false);

    const emit = async (step: AgentStep) => {
      if (controller.signal.aborted) return;
      setSteps((prev) => [...prev, step]);
    };

    try {
      await runAgent(taskText, emit, setCart, setOrder, controller.signal);
    } catch {
      // aborted or error — ignore
    }

    if (!controller.signal.aborted) {
      setIsRunning(false);
      setIsDone(true);
    }
  }, [taskInput]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setIsDone(true);
  };

  const handleSuggestion = (s: string) => {
    setTaskInput(s);
    handleRun(s);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isRunning) handleRun();
  };

  const toolCallCount = steps.filter((s) => s.type === 'tool_call').length;
  const uniqueTools = new Set(steps.filter((s) => s.tool).map((s) => s.tool)).size;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="px-6 pt-6 pb-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <a href="/" className="font-bold text-lg font-mono tracking-tight hover:opacity-80 transition-opacity">
            <span style={{ color: '#00f0ff' }}>ag</span>orio
          </a>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm" style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Playground
          </div>
        </div>
      </header>

      <div className="px-6 pb-20 max-w-7xl mx-auto">
        {/* Input Area */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 animate-fade-up">
            Agent Playground
          </h1>
          <p className="text-[var(--muted)] mb-5 animate-fade-up delay-100 text-sm">
            Type any shopping task. The agent runs client-side against an in-browser mock merchant with real product data.
          </p>

          {/* Task input + run */}
          <div className="flex gap-3 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Buy me wireless headphones and track shipping..."
              disabled={isRunning}
              className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] font-mono text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            />
            <button
              onClick={isRunning ? handleStop : () => handleRun()}
              disabled={!isRunning && !taskInput.trim()}
              className={`px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200 shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isRunning
                  ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]'
              }`}
              style={isRunning ? {} : { background: 'linear-gradient(135deg, #00f0ff, #00c8d4)' }}
            >
              {isRunning ? 'Stop' : 'Run'}
            </button>
          </div>

          {/* Suggestions */}
          {steps.length === 0 && !isRunning && (
            <div className="flex flex-wrap gap-2 animate-fade-up delay-200">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-bright)] transition-all cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content: Steps + Sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Agent Steps */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--code-bg)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]" style={{ background: 'var(--terminal-bar)' }}>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
                </div>
                <span className="text-xs font-mono ml-2" style={{ color: '#6b7280' }}>agent-output</span>
                {isRunning && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs" style={{ color: '#00f0ff' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-status-pulse" style={{ background: '#00f0ff' }} />
                    running
                  </span>
                )}
                {isDone && !isRunning && (
                  <span className="ml-auto text-xs text-emerald-400">complete</span>
                )}
              </div>

              <div className="p-4 min-h-[420px] max-h-[600px] overflow-y-auto font-mono text-sm space-y-1.5">
                {steps.length === 0 && !isRunning && (
                  <div className="text-center py-20" style={{ color: '#6b7280' }}>
                    Type a task above or click a suggestion to start
                  </div>
                )}
                {steps.map((step, i) => (
                  <StepLine key={i} step={step} />
                ))}
                <div ref={stepsEndRef} />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Cart */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                Cart
              </h3>
              {cart.length > 0 ? (
                <div className="space-y-2">
                  {cart.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span style={{ color: 'var(--fg-dim)' }}>
                        {item.name} <span style={{ color: '#6b7280' }}>x{item.qty}</span>
                      </span>
                      <span className="font-mono" style={{ color: '#00f0ff' }}>${item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-[var(--border)] pt-2 mt-2 flex justify-between text-sm font-semibold">
                    <span>Subtotal</span>
                    <span className="font-mono">${cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: '#6b7280' }}>
                  {isRunning ? 'Updating...' : 'Empty'}
                </div>
              )}
            </div>

            {/* Order */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />
                Order
              </h3>
              {order ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: '#6b7280' }}>Order ID</span>
                    <span className="font-mono" style={{ color: '#00f0ff' }}>{order.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#6b7280' }}>Status</span>
                    <span className="text-emerald-400">{order.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#6b7280' }}>Total</span>
                    <span className="font-mono font-semibold">${order.total.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: '#6b7280' }}>
                  {isRunning ? 'Processing...' : 'No order yet'}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
                Agent Stats
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Steps</div>
                  <div className="font-mono font-bold text-lg">{steps.length}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Tool Calls</div>
                  <div className="font-mono font-bold text-lg">{toolCallCount}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Unique Tools</div>
                  <div className="font-mono font-bold text-lg">{uniqueTools}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Products</div>
                  <div className="font-mono font-bold text-lg">{CATALOG.length}</div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <a
              href="https://github.com/Nolpak14/agorio#quick-start"
              className="block text-center px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm hover:border-[var(--accent)] transition-all duration-200"
              style={{ color: '#00f0ff' }}
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

function StepLine({ step }: { step: AgentStep }) {
  const color = step.tool ? TOOL_COLORS[step.tool] || '#6b7280' : 'var(--fg-dim)';

  if (step.type === 'thinking') {
    return (
      <div className="animate-fade-up flex gap-2 py-1">
        <span className="shrink-0" style={{ color: '#6b7280' }}>[Think]</span>
        <span style={{ color: 'var(--fg-dim)' }}>{step.content}</span>
      </div>
    );
  }

  if (step.type === 'tool_call') {
    return (
      <div className="animate-fade-up flex gap-2 py-1">
        <span className="shrink-0" style={{ color }}>[Tool]</span>
        <span>
          <span style={{ color }} className="font-semibold">{step.tool}</span>
          <span style={{ color: '#6b7280' }}>(</span>
          <span style={{ color: 'var(--fg-dim)' }}>{step.content}</span>
          <span style={{ color: '#6b7280' }}>)</span>
        </span>
      </div>
    );
  }

  if (step.type === 'tool_result') {
    return (
      <div className="animate-fade-up flex gap-2 py-1 pl-4 border-l-2 ml-2" style={{ borderColor: color + '33' }}>
        <span className="shrink-0" style={{ color: '#6b7280' }}>&rarr;</span>
        <span className="break-all" style={{ color: 'var(--fg-dim)' }}>{step.content}</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex gap-2 py-1 text-red-400">
      <span className="shrink-0">[Error]</span>
      <span>{step.content}</span>
    </div>
  );
}
