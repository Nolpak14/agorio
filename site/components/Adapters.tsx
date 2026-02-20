'use client';

import { useEffect, useRef, useState } from 'react';
import CodeBlock from './CodeBlock';

const adapters = [
  {
    name: 'Google Gemini',
    className: 'GeminiAdapter',
    color: '#4285F4',
    glow: 'rgba(66, 133, 244, 0.15)',
    code: `new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY })`,
  },
  {
    name: 'Anthropic Claude',
    className: 'ClaudeAdapter',
    color: '#D97706',
    glow: 'rgba(217, 119, 6, 0.15)',
    code: `new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY })`,
  },
  {
    name: 'OpenAI GPT',
    className: 'OpenAIAdapter',
    color: '#10B981',
    glow: 'rgba(16, 185, 129, 0.15)',
    code: `new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY })`,
  },
  {
    name: 'Ollama (Local)',
    className: 'OllamaAdapter',
    color: '#8B5CF6',
    glow: 'rgba(139, 92, 246, 0.15)',
    code: `new OllamaAdapter({ model: 'llama3.1' })`,
  },
];

const swapCode = `// Swap your LLM with a single line — zero code changes
const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
  // llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
  // llm: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  // llm: new OllamaAdapter({ model: 'llama3.1' }), // fully local
});

// Stream results in real time
for await (const event of agent.runStream("Buy headphones")) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}`;

export default function Adapters() {
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
        Works with any LLM
      </h2>
      <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        Four adapters ship out of the box — all with streaming support. Use Ollama for fully local agents. Implement the{' '}
        <code className="text-[var(--accent)] bg-[var(--code-bg)] px-1.5 py-0.5 rounded text-xs font-mono">
          LlmAdapter
        </code>{' '}
        interface to bring your own.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {adapters.map((a, i) => (
          <div
            key={a.name}
            className={`card-tilt p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] ${visible ? 'animate-fade-up' : 'opacity-0'}`}
            style={{
              animationDelay: `${(i + 2) * 100}ms`,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = a.color;
              (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px rgba(0,0,0,0.4), 0 0 30px ${a.glow}`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = '';
              (e.currentTarget as HTMLElement).style.boxShadow = '';
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: a.color, boxShadow: `0 0 8px ${a.glow}` }}
              />
              <span className="font-medium text-sm">{a.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <code className="text-xs text-[var(--muted)] font-mono">
                {a.className}
              </code>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 animate-status-pulse">
                Available
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={`max-w-3xl mx-auto ${visible ? 'animate-fade-up delay-600' : 'opacity-0'}`}>
        <CodeBlock code={swapCode} filename="swap-adapters.ts" />
      </div>
    </section>
  );
}
