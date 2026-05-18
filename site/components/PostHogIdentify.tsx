import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { customers } from '@/db/schema';
import { auth } from '@/lib/auth-server';
import { PostHogIdentifyClient } from './PostHogIdentifyClient';

/**
 * Server component. Reads the current Neon Auth session and, if a customer
 * row exists, renders a tiny client child that calls posthog.identify() with
 * email as distinctId. Returns null on anonymous pages — PostHog continues
 * tracking the visitor anonymously until they sign in.
 */
export default async function PostHogIdentify() {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) return null;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, session.user.email))
    .limit(1);

  return (
    <PostHogIdentifyClient
      distinctId={session.user.email}
      email={session.user.email}
      plan={customer?.plan ?? 'free'}
      status={customer?.status ?? null}
    />
  );
}
