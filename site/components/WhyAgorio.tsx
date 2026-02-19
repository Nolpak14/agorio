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
  return (
    <section className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-4">
        Why Agorio
      </h2>
      <p className="text-center text-(--muted) mb-12 max-w-2xl mx-auto">
        Stop rebuilding commerce plumbing. Focus on what makes your agent unique.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-(--border)">
              <th className="text-left py-3 px-4 text-(--muted) font-medium">
                Capability
              </th>
              <th className="text-left py-3 px-4 text-(--muted) font-medium">
                Building from Scratch
              </th>
              <th className="text-left py-3 px-4 text-(--accent) font-medium">
                With Agorio
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((row) => (
              <tr
                key={row.capability}
                className="border-b border-(--border) hover:bg-(--card) transition-colors"
              >
                <td className="py-3 px-4 font-medium">{row.capability}</td>
                <td className="py-3 px-4 text-(--muted)">{row.scratch}</td>
                <td className="py-3 px-4">
                  <code className="text-(--accent) bg-(--code-bg) px-1.5 py-0.5 rounded text-xs">
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
