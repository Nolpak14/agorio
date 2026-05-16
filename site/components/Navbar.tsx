'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@neondatabase/neon-js/auth/react/ui';

const links = [
  { href: '/', label: 'Home' },
  { href: '/playground', label: 'Playground' },
  { href: '/pricing', label: 'Pricing' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[var(--bg)]/80 border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg font-mono tracking-tight">
          <span className="text-[var(--accent)]">ag</span>orio
        </Link>

        <div className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                pathname === link.href
                  ? 'text-[var(--fg)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {link.label}
            </Link>
          ))}

          <SignedOut>
            <Link
              href="/auth/sign-in"
              className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
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

          <SignedIn>
            <Link
              href="/dashboard"
              className={`text-sm transition-colors ${
                pathname === '/dashboard'
                  ? 'text-[var(--fg)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              Dashboard
            </Link>
            <UserButton />
          </SignedIn>

          <a
            href="https://github.com/Nolpak14/agorio"
            className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
            target="_blank"
            rel="noopener"
            aria-label="GitHub"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </div>
    </nav>
  );
}
