'use client';

import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { authClient } from '@/lib/auth-client';
import PostHogPageView from './PostHogPageView';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? 'https://eu.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: false, // PostHogPageView handles App Router navigations
    capture_pageleave: true,
    capture_exceptions: true,
    // Session replays — gold for first-trace activation. Inputs masked by default.
    session_recording: {
      maskAllInputs: true,
    },
    debug: process.env.NODE_ENV === 'development',
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      <NeonAuthUIProvider
        authClient={authClient}
        navigate={router.push}
        replace={router.replace}
        Link={Link}
        redirectTo="/traces"
        defaultTheme="dark"
      >
        {children}
      </NeonAuthUIProvider>
    </PHProvider>
  );
}
