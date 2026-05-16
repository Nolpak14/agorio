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
          <Link href="/" className="inline-block mb-2">
            <span className="font-bold text-lg font-mono">
              <span className="text-[var(--accent)]">ag</span>orio
            </span>
            <span className="text-[var(--muted)] text-sm ml-2">Cloud</span>
          </Link>
          <p className="text-sm text-[var(--muted)]">
            Hosted observability for AI commerce agents.
          </p>
        </div>
        <AuthView pathname={pathname} />
      </div>
    </main>
  );
}
