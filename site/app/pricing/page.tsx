'use client';

import { useEffect, useRef, useState } from 'react';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'The full SDK core, MIT licensed. Build agents with zero restrictions.',
    accent: 'var(--muted)',
    features: [
      'ShoppingAgent with plan-act-observe loop',
      'All 4 LLM adapters (Gemini, Claude, OpenAI, Ollama)',
      'UCP + ACP + MCP triple-protocol support',
      'AgentPlugin system for custom tools',
      'Observability (logging, tracing, metrics)',
      'CLI tool (npx agorio)',
      'Mock merchants for testing',
      'Community support via GitHub',
    ],
    cta: 'Get Started',
    ctaHref: 'https://github.com/Nolpak14/agorio',
    ctaStyle: 'border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)]',
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/year per team',
    description: 'Flat-fee access to all governance plugins for your team. Unlimited agents, one license key. Or $19/mo billed monthly.',
    accent: 'var(--accent)',
    popular: true,
    features: [
      'Everything in Free, plus:',
      'Spending Controls plugin',
      'Approval Workflow plugin',
      'Audit Trail plugin',
      'Agent Identity plugin',
      'npm package access (@agorio/plugin-*)',
      'License key for validation',
      'Priority GitHub issues',
    ],
    cta: 'Get License Key',
    ctaHref: 'mailto:piotr.kaplon@outlook.com?subject=Agorio%20Pro%20License',
    ctaStyle: 'bg-gradient-to-r from-[var(--accent)] to-[#00c8d4] text-black font-semibold hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'annual contract',
    description: 'Custom implementation, SLA, dedicated protocol maintenance retainer, and hands-on onboarding.',
    accent: 'var(--violet)',
    features: [
      'Everything in Pro, plus:',
      'Policy Engine plugin (advanced rule engine)',
      'Custom plugin development',
      'Dedicated protocol maintenance SLA',
      'Onboarding and integration support',
      'Private Slack/Teams channel',
      'Custom merchant adapters',
      'Compliance review and documentation',
    ],
    cta: 'Contact Us',
    ctaHref: 'mailto:piotr.kaplon@outlook.com?subject=Agorio%20Enterprise%20Inquiry',
    ctaStyle: 'bg-gradient-to-r from-[var(--violet)] to-[#6d28d9] text-white font-semibold hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]',
  },
];

const plugins = [
  {
    name: 'Spending Controls',
    pkg: '@agorio/plugin-spending-controls',
    tier: 'Pro',
    tierColor: 'var(--accent)',
    description: 'Enforce per-transaction, per-session, and rolling daily spending limits. Intercepts submit_payment and tracks total spend across the session.',
    hooks: ['onInit', 'onBeforeToolCall', 'onAfterToolCall'],
    capabilities: ['Per-transaction limit', 'Session budget cap', 'Rolling daily limit', 'Remaining budget query tool'],
  },
  {
    name: 'Approval Workflow',
    pkg: '@agorio/plugin-approval-workflow',
    tier: 'Pro',
    tierColor: 'var(--accent)',
    description: 'Pause the agent before checkout and require external approval via webhook or manual action. Configurable thresholds with auto-approve for small transactions.',
    hooks: ['onInit', 'onBeforeToolCall'],
    capabilities: ['Threshold-based approval gates', 'Webhook notifications', 'Approve/deny via tool call', 'Auto-approve below threshold'],
  },
  {
    name: 'Audit Trail',
    pkg: '@agorio/plugin-audit-trail',
    tier: 'Pro',
    tierColor: 'var(--accent)',
    description: 'Log every tool invocation and result with timestamps, latency, and optional field redaction. Supports console, webhook, and callback output modes.',
    hooks: ['onBeforeToolCall', 'onAfterToolCall'],
    capabilities: ['Structured audit log', 'Latency tracking', 'Field redaction', 'Webhook batch export'],
  },
  {
    name: 'Agent Identity',
    pkg: '@agorio/plugin-agent-identity',
    tier: 'Pro',
    tierColor: 'var(--accent)',
    description: 'Attach organizational identity to the agent including department, permissions, and contact information. Context enrichment for compliance and audit.',
    hooks: ['onRegister', 'onBeforeToolCall'],
    capabilities: ['Org identity attachment', 'Permission declarations', 'Activity logging per tool', 'Identity query tool'],
  },
  {
    name: 'Policy Engine',
    pkg: '@agorio/plugin-policy-engine',
    tier: 'Enterprise',
    tierColor: 'var(--violet)',
    description: 'Evaluate JSON-based policy rules before every tool call. Supports merchant allowlists, value caps, time restrictions, and required field validation.',
    hooks: ['onBeforeToolCall'],
    capabilities: ['Merchant allowlists', 'Value cap enforcement', 'Time-of-day restrictions', 'Required field validation'],
  },
];

export default function PricingPage() {
  const tierRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<HTMLDivElement>(null);
  const [tierVisible, setTierVisible] = useState(false);
  const [pluginVisible, setPluginVisible] = useState(false);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const observe = (el: HTMLElement | null, setter: (v: boolean) => void) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) { setter(true); obs.disconnect(); } },
        { threshold: 0.1 }
      );
      obs.observe(el);
      observers.push(obs);
    };
    observe(tierRef.current, setTierVisible);
    observe(pluginRef.current, setPluginVisible);
    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <main className="pt-20">
      {/* Header */}
      <section className="px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 animate-fade-up">
          Simple, transparent{' '}
          <span
            className="text-transparent bg-clip-text animate-gradient"
            style={{
              backgroundImage: 'linear-gradient(135deg, var(--accent), var(--violet), var(--accent))',
              backgroundSize: '200% 200%',
            }}
          >
            pricing
          </span>
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto animate-fade-up delay-100">
          The SDK is free and MIT-licensed forever. Enterprise plugins are professionally
          packaged, tested, and maintained against protocol spec changes.
        </p>
      </section>

      {/* Tier Cards */}
      <section ref={tierRef} className="px-6 pb-20 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          {tiers.map((tier, i) => (
            <div
              key={tier.name}
              className={`relative card-hover rounded-xl border bg-[var(--card)] p-6 flex flex-col ${
                tierVisible ? 'animate-fade-up' : 'opacity-0'
              } ${tier.popular
                ? 'border-[var(--accent)] shadow-[0_0_30px_rgba(0,240,255,0.08)]'
                : 'border-[var(--border)]'
              }`}
              style={{ animationDelay: `${(i + 1) * 100}ms` }}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold bg-[var(--accent)] text-black">
                  Most Popular
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: tier.accent }}
                  />
                  <h3 className="font-semibold text-lg">{tier.name}</h3>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold font-mono">{tier.price}</span>
                  <span className="text-sm text-[var(--muted)]">{tier.period}</span>
                </div>
                <p className="text-sm text-[var(--muted)]">{tier.description}</p>
              </div>

              <ul className="flex-1 space-y-2 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tier.accent }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[var(--fg-dim)]">{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href={tier.ctaHref}
                className={`block text-center px-5 py-2.5 rounded-lg text-sm transition-all duration-300 ${tier.ctaStyle}`}
                target={tier.ctaHref.startsWith('http') ? '_blank' : undefined}
                rel={tier.ctaHref.startsWith('http') ? 'noopener' : undefined}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Plugin Catalog */}
      <div className="gradient-divider" />

      <section ref={pluginRef} className="px-6 py-20 max-w-5xl mx-auto">
        <h2 className={`text-3xl font-bold text-center mb-4 ${pluginVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          Enterprise Plugin Catalog
        </h2>
        <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${pluginVisible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
          Governance plugins anyone <em>could</em> build, sold as maintained npm packages.
          The value is batteries-included, tested, and maintained against protocol spec changes.
        </p>

        <div className="space-y-4">
          {plugins.map((plugin, i) => (
            <div
              key={plugin.name}
              className={`card-hover rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 ${
                pluginVisible ? 'animate-fade-up' : 'opacity-0'
              }`}
              style={{ animationDelay: `${(i + 2) * 100}ms` }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{plugin.name}</h3>
                    <span
                      className="stage-badge px-2 py-0.5 rounded-full border"
                      style={{
                        color: plugin.tierColor,
                        borderColor: plugin.tierColor,
                      }}
                    >
                      {plugin.tier}
                    </span>
                  </div>

                  <div className="font-mono text-xs text-[var(--muted)] mb-3">
                    {plugin.pkg}
                  </div>

                  <p className="text-sm text-[var(--fg-dim)] mb-4">{plugin.description}</p>

                  <div className="flex flex-wrap gap-4">
                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1.5 uppercase tracking-wider">Hooks</div>
                      <div className="flex flex-wrap gap-1.5">
                        {plugin.hooks.map((h) => (
                          <span
                            key={h}
                            className="px-2 py-0.5 rounded text-xs font-mono bg-[var(--code-bg)] border border-[var(--border)] text-[var(--fg-dim)]"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1.5 uppercase tracking-wider">Capabilities</div>
                      <div className="flex flex-wrap gap-1.5">
                        {plugin.capabilities.map((c) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 rounded text-xs bg-[var(--code-bg)] border border-[var(--border)] text-[var(--fg-dim)]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ / Bottom CTA */}
      <div className="gradient-divider" />

      <section className="px-6 py-20 max-w-3xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Not sure which tier?</h2>
        <p className="text-[var(--muted)] mb-8">
          Start with the free SDK. When you need governance guardrails for production agents,
          upgrade to Pro. For custom integrations and SLA, reach out for Enterprise.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/Nolpak14/agorio"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-300"
            target="_blank"
            rel="noopener"
          >
            View on GitHub
          </a>
          <a
            href="mailto:piotr.kaplon@outlook.com?subject=Agorio%20Pricing%20Question"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm text-black font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
          >
            Talk to Us
          </a>
        </div>
      </section>
    </main>
  );
}
