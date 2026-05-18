'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@neondatabase/neon-js/auth/react/ui';

export default function CloudNavbar() {
  return (
    <header className="cloud-nav">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-[var(--accent)]">Agorio</span>
          <span className="text-[var(--muted)] text-sm">Cloud</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <SignedIn>
            <Link href="/traces" className="hover:text-[var(--accent)] transition-colors">
              Traces
            </Link>
            <Link href="/api-keys" className="hover:text-[var(--accent)] transition-colors">
              API keys
            </Link>
            <Link href="/team" className="hover:text-[var(--accent)] transition-colors">
              Team
            </Link>
            <Link href="/compliance" className="hover:text-[var(--accent)] transition-colors">
              Compliance
            </Link>
            <Link href="/audit-log" className="hover:text-[var(--accent)] transition-colors">
              Audit log
            </Link>
            <a
              href="https://agorio.dev/dashboard"
              className="hover:text-[var(--accent)] transition-colors text-[var(--muted)]"
            >
              Billing ↗
            </a>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <Link
              href="/auth/sign-in"
              className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/sign-up"
              className="px-3 py-1.5 rounded-lg text-sm text-black font-semibold transition-all hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
              style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
            >
              Sign up
            </Link>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}
