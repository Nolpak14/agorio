'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

type Props = {
  distinctId: string;
  email: string;
  plan: string;
  status: string | null;
};

export function PostHogIdentifyClient({ distinctId, email, plan, status }: Props) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.identify(distinctId, {
      email,
      plan,
      ...(status ? { subscription_status: status } : {}),
    });
  }, [distinctId, email, plan, status]);
  return null;
}
