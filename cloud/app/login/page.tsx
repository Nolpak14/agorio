'use client';

import { AuthView } from '@neondatabase/neon-js/auth/react/ui';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Agorio Cloud</h1>
          <p className="text-sm text-[var(--muted)]">
            Sign in with the same email you used to subscribe.
          </p>
        </div>
        <AuthView path="sign-in" />
      </div>
    </main>
  );
}
