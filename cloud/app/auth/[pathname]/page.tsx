'use client';

import { use } from 'react';
import Link from 'next/link';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';

interface PageProps {
  params: Promise<{ pathname: string }>;
}

const TERMINAL_FILENAMES: Record<string, string> = {
  'sign-in': 'cloud.agorio.dev/auth/sign-in',
  'sign-up': 'cloud.agorio.dev/auth/sign-up',
  'forgot-password': 'cloud.agorio.dev/auth/forgot-password',
  'reset-password': 'cloud.agorio.dev/auth/reset-password',
  'verify-email': 'cloud.agorio.dev/auth/verify',
  'callback': 'cloud.agorio.dev/auth/callback',
  'magic-link': 'cloud.agorio.dev/auth/magic-link',
};

export default function AuthPage({ params }: PageProps) {
  const { pathname } = use(params);
  const filename = TERMINAL_FILENAMES[pathname] ?? `cloud.agorio.dev/auth/${pathname}`;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-24 relative isolate">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] rounded-full blur-3xl opacity-25 -z-10"
        style={{
          background:
            'radial-gradient(circle at center, var(--accent-glow), transparent 65%)',
        }}
      />

      <div className="w-full max-w-md">
        {/* Wordmark + tagline */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-baseline gap-2 transition-opacity hover:opacity-80"
          >
            <span className="font-bold text-2xl font-mono tracking-tight">
              <span className="text-[var(--accent)]">ag</span>orio
            </span>
            <span className="text-[var(--muted)] text-sm font-mono">Cloud</span>
          </Link>
          <p className="mt-3 text-sm text-[var(--muted)] font-mono">
            <span className="text-[var(--accent)]">$</span> hosted observability for AI agents
          </p>
        </div>

        {/* Terminal bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-t-xl border border-b-0 border-[var(--border)] bg-[var(--terminal-bar)]">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-xs font-mono text-[var(--muted)] ml-2 truncate">
            {filename}
          </span>
        </div>

        <AuthView
          pathname={pathname}
          classNames={{
            base: 'w-full max-w-none rounded-t-none border-t-0 shadow-[0_0_60px_rgba(0,240,255,0.05)]',
            header: 'pt-1',
            title: 'font-mono tracking-tight text-xl md:text-xl',
            description: 'text-sm',
            footer: 'border-t border-[var(--border)] pt-5 mt-1 justify-center text-sm text-[var(--muted)]',
            footerLink: 'text-[var(--accent)] hover:opacity-80',
            form: {
              base: 'gap-5',
              label: 'text-xs uppercase tracking-wider font-mono text-[var(--muted)]',
              input:
                'bg-[var(--code-bg)] h-10 text-sm font-mono placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-glow)] transition-colors',
              primaryButton:
                'h-10 rounded-md font-semibold tracking-wide text-black bg-gradient-to-r from-[var(--accent)] to-[#00c8d4] hover:shadow-[0_0_24px_rgba(0,240,255,0.35)] transition-all',
              secondaryButton: 'h-10 rounded-md',
              outlineButton:
                'h-10 rounded-md border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--card-hover)] transition-colors',
              forgotPasswordLink: 'text-[var(--accent)] hover:opacity-80 text-xs font-mono',
              error: 'text-sm text-red-400',
            },
          }}
        />

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-4 text-xs font-mono text-[var(--muted)]">
          <a
            href="https://github.com/Nolpak14/agorio"
            target="_blank"
            rel="noopener"
            className="hover:text-[var(--fg)] transition-colors flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400/70" />
            MIT · v0.6
          </a>
          <span className="text-[var(--border-bright)]">·</span>
          <a
            href="https://agorio.dev/pricing"
            className="hover:text-[var(--fg)] transition-colors"
          >
            Pricing
          </a>
        </div>
      </div>
    </main>
  );
}
