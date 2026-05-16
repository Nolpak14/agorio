'use client';

import { use } from 'react';
import Link from 'next/link';
import { AuthView } from '@neondatabase/neon-js/auth/react/ui';

interface PageProps {
  params: Promise<{ pathname: string }>;
}

export default function AuthPage({ params }: PageProps) {
  const { pathname } = use(params);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block font-bold text-lg font-mono tracking-tight mb-2">
            <span className="text-[var(--accent)]">ag</span>orio
          </Link>
          <p className="text-sm text-[var(--muted)]">
            The open-source toolkit for AI commerce agents.
          </p>
        </div>
        <AuthView pathname={pathname} />
      </div>
    </main>
  );
}
