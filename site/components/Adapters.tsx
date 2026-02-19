import CodeBlock from './CodeBlock';

const adapters = [
  {
    name: 'Google Gemini',
    className: 'GeminiAdapter',
    color: '#4285F4',
    code: `new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY })`,
  },
  {
    name: 'Anthropic Claude',
    className: 'ClaudeAdapter',
    color: '#D97706',
    code: `new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY })`,
  },
  {
    name: 'OpenAI GPT',
    className: 'OpenAIAdapter',
    color: '#10B981',
    code: `new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY })`,
  },
];

const swapCode = `// Swap your LLM with a single line — zero code changes
const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
  // llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
  // llm: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
});

// Stream results in real time
for await (const event of agent.runStream("Buy headphones")) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}`;

export default function Adapters() {
  return (
    <section className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-4">
        Works with any LLM
      </h2>
      <p className="text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto">
        Three adapters ship out of the box — all with streaming support. Implement the{' '}
        <code className="text-[var(--accent)] bg-[var(--code-bg)] px-1.5 py-0.5 rounded text-xs">
          LlmAdapter
        </code>{' '}
        interface to bring your own.
      </p>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        {adapters.map((a) => (
          <div
            key={a.name}
            className="p-5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted)] transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: a.color }}
              />
              <span className="font-medium">{a.name}</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                Available
              </span>
            </div>
            <code className="text-xs text-[var(--muted)] font-mono">
              {a.className}
            </code>
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto">
        <CodeBlock code={swapCode} filename="swap-adapters.ts" />
      </div>
    </section>
  );
}
