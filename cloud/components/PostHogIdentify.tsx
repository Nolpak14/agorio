import { getCurrentCustomer } from '@/lib/customer';
import { PostHogIdentifyClient } from './PostHogIdentifyClient';

/**
 * Server component. Resolves the current customer via the shared session
 * helper and identifies them in PostHog client-side. Anonymous routes
 * return null and the visitor stays anonymous in PostHog until sign-in.
 */
export default async function PostHogIdentify() {
  const result = await getCurrentCustomer();
  if (!result) return null;

  return (
    <PostHogIdentifyClient
      distinctId={result.email}
      email={result.email}
      plan={result.customer?.plan ?? 'free'}
      status={result.customer?.status ?? null}
    />
  );
}
