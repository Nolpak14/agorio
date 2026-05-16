import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export default async function CloudRoot() {
  const { data: session } = await auth.getSession();
  if (session?.user) redirect('/traces');
  redirect('/login');
}
