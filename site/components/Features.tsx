import CodeBlock from './CodeBlock';

const features = [
  {
    title: 'CLI Tool',
    desc: 'Scaffold projects, start mock merchants, and discover capabilities from the command line.',
    code: `$ npx agorio init my-agent
$ npx agorio mock --mcp --port 3456
$ npx agorio discover localhost:3456`,
  },
  {
    title: 'MCP Transport',
    desc: 'Automatic JSON-RPC 2.0 transport detection. MCP when available, REST fallback. Zero config.',
    code: `// Auto-detects MCP or REST — no changes needed
const client = new UcpClient();
await client.discover('shop.example.com');
const products = await client.callApi('/products');
// Works over MCP (JSON-RPC) or REST automatically`,
  },
  {
    title: 'Plugin System',
    desc: 'Extend the agent with custom tools beyond the built-in 12. Async handlers with JSON Schema.',
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
    code: `const result = await agent.run('Buy headphones');
console.log(result.usage?.totalTokens);    // 4521
console.log(result.usage?.llmCalls);        // 6
console.log(result.usage?.toolCalls);       // 8
console.log(result.usage?.totalLatencyMs);  // 3200`,
  },
];

export default function Features() {
  return (
    <section className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-4">
        New in v0.3
      </h2>
      <p className="text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto">
        MCP transport, plugin extensibility, production observability, and a developer CLI.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {features.map((f) => (
          <div
            key={f.title}
            className="p-6 rounded-lg border border-[var(--border)] bg-[var(--card)]"
          >
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-sm text-[var(--muted)] mb-4">{f.desc}</p>
            <CodeBlock code={f.code} filename={f.title === 'CLI Tool' ? 'terminal' : 'example.ts'} />
          </div>
        ))}
      </div>
    </section>
  );
}
