'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth-server';
import { db } from '@/db';
import { apiKeys, customers } from '@/db/schema';

type ApiKeyEnv = 'dev' | 'prod' | 'test';
const VALID_ENVS: readonly ApiKeyEnv[] = ['dev', 'prod', 'test'];

async function currentCustomerId(): Promise<number> {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) throw new Error('Not authenticated');

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, session.user.email))
    .limit(1);

  if (!customer) throw new Error('No subscription found for this account');
  return customer.id;
}

export interface CreatedKey {
  key: string;
  label: string;
  env: ApiKeyEnv;
}

export async function createApiKey(formData: FormData): Promise<CreatedKey> {
  const label = String(formData.get('label') ?? '').trim();
  const envInput = String(formData.get('env') ?? 'prod').trim() as ApiKeyEnv;

  if (!label) throw new Error('Label is required');
  if (label.length > 100) throw new Error('Label must be 100 characters or fewer');
  if (!VALID_ENVS.includes(envInput)) throw new Error('Invalid environment');

  const customerId = await currentCustomerId();
  const secret = randomBytes(16).toString('hex');
  const key = `agorio_sk_${envInput}_${secret}`;

  await db.insert(apiKeys).values({
    customerId,
    key,
    keyPrefix: key.slice(0, 16),
    label,
    env: envInput,
  });

  revalidatePath('/api-keys');
  return { key, label, env: envInput };
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  const id = Number(formData.get('id') ?? 0);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid key id');

  const customerId = await currentCustomerId();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.customerId, customerId)));

  revalidatePath('/api-keys');
}
