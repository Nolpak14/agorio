'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polls the route every 2s while the run is in_progress so the user sees
 * spans/logs as they stream in. Stops as soon as the parent re-renders
 * without this component (status flips to success/failure).
 */
export default function TraceAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
