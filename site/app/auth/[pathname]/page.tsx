'use client';

import { use } from 'react';
import Link from 'next/link';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';

interface PageProps {
  params: Promise<{ pathname: string }>;
}

// Maps the auth path slug to a friendly file name shown in the terminal bar.
// Keeps the rest of the brand voice ("you're configuring an agent runtime")
// consistent with the homepage code blocks.
const TERMINAL_FILENAMES: Record<string, string> = {
  'sign-in': '~/agorio/auth/sign-in.ts',
  'sign-up': '~/agorio/auth/sign-up.ts',
  'forgot-password': '~/agorio/auth/forgot-password.ts',
  'reset-password': '~/agorio/auth/reset-password.ts',
  'verify-email': '~/agorio/auth/verify.ts',
  'callback': '~/agorio/auth/callback.ts',
  'magic-link': '~/agorio/auth/magic-link.ts',
};

export default function AuthPage({ params }: PageProps) {
  const { pathname } = use(params);
  const filename = TERMINAL_FILENAMES[pathname] ?? `~/agorio/auth/${pathname}.ts`;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-24 relative isolate">
      {/* Ambient glow behind the card */}
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
            className="inline-block font-bold text-2xl font-mono tracking-tight transition-opacity hover:opacity-80"
          >
            <span className="text-[var(--accent)]">ag</span>orio
          </Link>
          <p className="mt-3 text-sm text-[var(--muted)] font-mono">
            <span className="text-[var(--accent)]">$</span> open-source AI commerce agents
          </p>
        </div>

        {/* Terminal bar — visually fused with the AuthView card below */}
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

        {/* AuthView with brand-specific class overrides */}
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

        {/* Quiet footer */}
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
          <Link href="/pricing" className="hover:text-[var(--fg)] transition-colors">
            Pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
