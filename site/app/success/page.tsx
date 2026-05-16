'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  async function handleManageBilling() {
    const res = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
        >
          <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-3">You&apos;re all set</h1>
        <p className="text-[var(--muted)] mb-6">
          Your Agorio Pro license is active. Next: create an API key and ship your first trace to Agorio Cloud.
        </p>

        <ol className="text-left text-sm text-[var(--muted)] space-y-2 mb-8 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <li>
            <span className="text-[var(--accent)] font-mono">1.</span>{' '}
            <Link href="/dashboard#api-keys" className="text-[var(--fg)] hover:text-[var(--accent)] underline">
              Create an API key
            </Link>{' '}
            on the dashboard.
          </li>
          <li>
            <span className="text-[var(--accent)] font-mono">2.</span> Pass it to{' '}
            <code className="font-mono text-xs text-[var(--accent)]">agorioCloud&#123; apiKey &#125;</code>{' '}
            in your agent options.
          </li>
          <li>
            <span className="text-[var(--accent)] font-mono">3.</span> See your trace appear at{' '}
            <Link href="https://cloud.agorio.dev/traces" className="text-[var(--fg)] hover:text-[var(--accent)] underline">
              cloud.agorio.dev/traces
            </Link>
            .
          </li>
        </ol>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {sessionId && (
            <button
              onClick={handleManageBilling}
              className="px-5 py-2.5 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-300"
            >
              Manage billing
            </button>
          )}
          <Link
            href="/dashboard#api-keys"
            className="px-5 py-2.5 rounded-lg text-sm text-black font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
