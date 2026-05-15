'use client';

import { useEffect, useRef, useState } from 'react';

const PRICE_ANNUAL = process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL!;
const PRICE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY!;

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
      'All 5 governance plugins — MIT, free on npm',
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
    description: 'Early access to Agorio Cloud — hosted observability, approval webhooks, and CI mock merchants. Or $19/mo billed monthly.',
    accent: 'var(--accent)',
    popular: true,
    comingSoon: true,
    features: [
      'Everything in Free, plus:',
      'Agorio Cloud early access (Q3 2026)',
      'Hosted commerce observability dashboard',
      'Per-run agent trace explorer',
      'Hosted approval-workflow webhook receiver',
      'License-key-gated CI mock merchants',
      'EU AI Act compliance audit exports',
      'Priority GitHub issues',
    ],
    cta: 'Reserve Pro Access',
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
      'Dedicated Cloud tenant with SSO (Okta, Azure AD)',
      'Custom plugin development',
      'Dedicated protocol maintenance SLA',
      'Onboarding and integration support',
      'Private Slack/Teams channel',
      'Custom merchant adapters',
      'On-prem / self-hosted option',
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
    tier: 'Free',
    tierColor: 'var(--muted)',
    description: 'Enforce per-transaction, per-session, and rolling daily spending limits. Intercepts submit_payment and tracks total spend across the session.',
    hooks: ['onInit', 'onBeforeToolCall', 'onAfterToolCall'],
    capabilities: ['Per-transaction limit', 'Session budget cap', 'Rolling daily limit', 'Remaining budget query tool'],
  },
  {
    name: 'Approval Workflow',
    pkg: '@agorio/plugin-approval-workflow',
    tier: 'Free',
    tierColor: 'var(--muted)',
    description: 'Pause the agent before checkout and require external approval via webhook or manual action. Configurable thresholds with auto-approve for small transactions.',
    hooks: ['onInit', 'onBeforeToolCall'],
    capabilities: ['Threshold-based approval gates', 'Webhook notifications', 'Approve/deny via tool call', 'Auto-approve below threshold'],
  },
  {
    name: 'Audit Trail',
    pkg: '@agorio/plugin-audit-trail',
    tier: 'Free',
    tierColor: 'var(--muted)',
    description: 'Log every tool invocation and result with timestamps, latency, and optional field redaction. Supports console, webhook, and callback output modes.',
    hooks: ['onBeforeToolCall', 'onAfterToolCall'],
    capabilities: ['Structured audit log', 'Latency tracking', 'Field redaction', 'Webhook batch export'],
  },
  {
    name: 'Agent Identity',
    pkg: '@agorio/plugin-agent-identity',
    tier: 'Free',
    tierColor: 'var(--muted)',
    description: 'Attach organizational identity to the agent including department, permissions, and contact information. Context enrichment for compliance and audit.',
    hooks: ['onRegister', 'onBeforeToolCall'],
    capabilities: ['Org identity attachment', 'Permission declarations', 'Activity logging per tool', 'Identity query tool'],
  },
  {
    name: 'Policy Engine',
    pkg: '@agorio/plugin-policy-engine',
    tier: 'Free',
    tierColor: 'var(--muted)',
    description: 'Evaluate JSON-based policy rules before every tool call. Supports merchant allowlists, value caps, time restrictions, and required field validation.',
    hooks: ['onBeforeToolCall'],
    capabilities: ['Merchant allowlists', 'Value cap enforcement', 'Time-of-day restrictions', 'Required field validation'],
  },
];

const faq = [
  {
    q: 'The plugins are free — what does Pro pay for?',
    a: 'Agorio is Open Core: the SDK and all governance plugins are MIT and free forever on npm. Pro unlocks access to Agorio Cloud — a hosted observability and control plane that ships in Q3 2026. Think of it as: code is free, the managed service is paid.',
  },
  {
    q: 'When does Agorio Cloud launch?',
    a: 'Cloud is targeted for Q3 2026 (v0.6). Pro subscribers today are reserving early access and will be the first to get dashboard credentials, hosted mock merchants for CI, and the approval-webhook receiver when it ships.',
  },
  {
    q: 'Do I need a license key to use the governance plugins?',
    a: 'No. As of v0.5, all 5 plugins (@agorio/plugin-spending-controls, @agorio/plugin-approval-workflow, @agorio/plugin-audit-trail, @agorio/plugin-agent-identity, @agorio/plugin-policy-engine) are MIT-licensed and available on npm with no license key required.',
  },
  {
    q: 'What is "Agorio Cloud" exactly?',
    a: 'A hosted platform at cloud.agorio.dev that adds: per-run agent trace explorer, org-level fleet view, click-to-approve UI for the approval-workflow plugin, URL-accessible mock merchants for CI pipelines, and EU AI Act-compatible audit log exports.',
  },
];

export default function PricingPage() {
  const tierRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const [tierVisible, setTierVisible] = useState(false);
  const [pluginVisible, setPluginVisible] = useState(false);
  const [faqVisible, setFaqVisible] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleCheckout(priceId: string) {
    setCheckingOut(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      window.location.href = data.url;
    } catch {
      setCheckingOut(false);
    }
  }

  useEffect(() => {
    const observe = (el: HTMLElement | null, setter: (v: boolean) => void) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) { setter(true); obs.disconnect(); } },
        { threshold: 0.1 }
      );
      obs.observe(el);
      return () => obs.disconnect();
    };
    const cleanups = [
      observe(tierRef.current, setTierVisible),
      observe(pluginRef.current, setPluginVisible),
      observe(faqRef.current, setFaqVisible),
    ];
    return () => cleanups.forEach(c => c?.());
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
          The SDK and all governance plugins are free, MIT-licensed, and on npm forever.
          Pro unlocks <strong className="text-[var(--fg)]">Agorio Cloud</strong> — hosted observability and control plane, launching Q3 2026.
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
                  {(tier as { comingSoon?: boolean }).comingSoon && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full border border-[var(--accent)] text-[var(--accent)] font-mono">
                      Coming Q3 2026
                    </span>
                  )}
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
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tier.accent === 'var(--muted)' ? 'var(--accent)' : tier.accent }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[var(--fg-dim)]">{f}</span>
                  </li>
                ))}
              </ul>

              {tier.name === 'Pro' ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleCheckout(PRICE_ANNUAL)}
                    disabled={checkingOut}
                    className={`w-full text-center px-5 py-2.5 rounded-lg text-sm transition-all duration-300 disabled:opacity-60 ${tier.ctaStyle}`}
                  >
                    {checkingOut ? 'Redirecting…' : 'Reserve Pro — $149/yr'}
                  </button>
                  <button
                    onClick={() => handleCheckout(PRICE_MONTHLY)}
                    disabled={checkingOut}
                    className="w-full text-center px-4 py-2 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--fg)] border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-300 disabled:opacity-60"
                  >
                    Monthly plan — $19/mo
                  </button>
                </div>
              ) : (
                <a
                  href={tier.ctaHref}
                  className={`block text-center px-5 py-2.5 rounded-lg text-sm transition-all duration-300 ${tier.ctaStyle}`}
                  target={tier.ctaHref?.startsWith('http') ? '_blank' : undefined}
                  rel={tier.ctaHref?.startsWith('http') ? 'noopener' : undefined}
                >
                  {tier.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Open Source Plugin Catalog */}
      <div className="gradient-divider" />

      <section ref={pluginRef} className="px-6 py-20 max-w-5xl mx-auto">
        <h2 className={`text-3xl font-bold text-center mb-4 ${pluginVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          Open Source Plugin Catalog
        </h2>
        <p className={`text-center text-[var(--muted)] mb-12 max-w-2xl mx-auto ${pluginVisible ? 'animate-fade-up delay-100' : 'opacity-0'}`}>
          All 5 governance plugins are MIT-licensed and published to npm — no license key, no paywall.
          Install any plugin with <code className="font-mono text-sm text-[var(--accent)]">npm install @agorio/plugin-*</code>.
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
                      className="stage-badge px-2 py-0.5 rounded-full border text-xs"
                      style={{
                        color: 'var(--fg-dim)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      Open Source
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

      {/* FAQ */}
      <div className="gradient-divider" />

      <section ref={faqRef} className="px-6 py-20 max-w-3xl mx-auto">
        <h2 className={`text-2xl font-bold text-center mb-10 ${faqVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faq.map((item, i) => (
            <div
              key={i}
              className={`rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden ${
                faqVisible ? 'animate-fade-up' : 'opacity-0'
              }`}
              style={{ animationDelay: `${(i + 1) * 80}ms` }}
            >
              <button
                className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-[var(--hover)] transition-colors"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="font-medium text-sm">{item.q}</span>
                <svg
                  className={`w-4 h-4 shrink-0 text-[var(--muted)] transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div className="px-6 pb-4 text-sm text-[var(--muted)] leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-[var(--muted)] mb-6 text-sm">
            Still have questions? The model is Open Core — code is always free, Cloud is the paid service.
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
        </div>
      </section>
    </main>
  );
}
