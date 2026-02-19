const tools = [
  { name: 'discover_merchant', desc: 'Fetch and parse a UCP profile by domain', icon: '🔍' },
  { name: 'list_capabilities', desc: 'List what the merchant supports', icon: '📋' },
  { name: 'browse_products', desc: 'Paginated catalog with filtering', icon: '🛒' },
  { name: 'search_products', desc: 'Keyword search across products', icon: '🔎' },
  { name: 'get_product', desc: 'Detailed product info with variants', icon: '📦' },
  { name: 'add_to_cart', desc: 'Add products with quantity selection', icon: '➕' },
  { name: 'view_cart', desc: 'View cart contents and subtotal', icon: '🧾' },
  { name: 'remove_from_cart', desc: 'Remove items from cart', icon: '❌' },
  { name: 'initiate_checkout', desc: 'Start checkout, get shipping options', icon: '🚀' },
  { name: 'submit_shipping', desc: 'Submit shipping address', icon: '📫' },
  { name: 'submit_payment', desc: 'Complete payment, receive order', icon: '💳' },
  { name: 'get_order_status', desc: 'Check status of an existing order', icon: '📊' },
];

export default function Tools() {
  return (
    <section className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-4">
        12 Built-in Shopping Tools
      </h2>
      <p className="text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto">
        Every tool the agent needs for the full UCP shopping workflow — from
        discovery to order tracking.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map((tool) => (
          <div
            key={tool.name}
            className="flex items-start gap-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted)] transition-colors"
          >
            <span className="text-xl mt-0.5">{tool.icon}</span>
            <div>
              <code className="text-sm font-mono text-[var(--accent)]">
                {tool.name}
              </code>
              <p className="text-xs text-[var(--muted)] mt-1">{tool.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
