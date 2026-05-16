import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { customers, type Customer } from '@/db/schema';
import { auth } from '@/lib/auth-server';

/**
 * Resolve the authenticated user to their `customers` row.
 *
 * Returns null if no session or no matching subscription. Callers should
 * redirect to /login or render a "subscribe to access Cloud" empty state.
 */
export async function getCurrentCustomer(): Promise<{ email: string; customer: Customer | null } | null> {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) return null;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, session.user.email))
    .limit(1);

  return { email: session.user.email, customer: customer ?? null };
}
