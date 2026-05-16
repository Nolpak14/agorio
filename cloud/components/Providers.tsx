'use client';

import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
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
  );
}
