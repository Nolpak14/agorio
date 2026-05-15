'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    accent: 'var(--muted)',
    highlight: 'MIT-licensed SDK core with all 4 LLM adapters, triple-protocol support, and plugin system.',
  },
  {
    name: 'Pro',
    price: '$149/yr',
    accent: 'var(--accent)',
    popular: true,
    highlight: 'Early access to Agorio Cloud — hosted agent observability, approval webhooks, and CI mock merchants. Launching Q3 2026.',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    accent: 'var(--violet)',
    highlight: 'Custom implementation, SSO, SLA, dedicated protocol maintenance, and on-prem option.',
  },
];

export default function PricingPreview() {
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
    <section ref={ref} className="px-6 py-20 max-w-5xl mx-auto">
      <h2 className={`text-3xl font-bold text-center mb-4 ${visible ? 'animate-fade-up' : 'opacity-0'}`}>
        From open-source to enterprise
      </h2>
      <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${visible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
        The SDK and all governance plugins are MIT-licensed and free forever. Pro unlocks Agorio Cloud — hosted observability launching Q3 2026.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {tiers.map((tier, i) => (
          <div
            key={tier.name}
            className={`card-hover rounded-xl border bg-[var(--card)] p-5 ${
              visible ? 'animate-fade-up' : 'opacity-0'
            } ${tier.popular
              ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(0,240,255,0.06)]'
              : 'border-[var(--border)]'
            }`}
            style={{ animationDelay: `${(i + 2) * 100}ms` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: tier.accent }} />
              <h3 className="font-semibold">{tier.name}</h3>
              {tier.popular && (
                <span className="ml-auto stage-badge px-2 py-0.5 rounded-full bg-[var(--accent)] text-black">
                  Popular
                </span>
              )}
            </div>
            <div className="text-2xl font-bold font-mono mb-2">{tier.price}</div>
            <p className="text-sm text-[var(--muted)]">{tier.highlight}</p>
          </div>
        ))}
      </div>

      <div className={`text-center ${visible ? 'animate-fade-up delay-500' : 'opacity-0'}`}>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)', color: 'black' }}
        >
          View Full Pricing
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
