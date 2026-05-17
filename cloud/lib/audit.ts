import { headers } from 'next/headers';
import { db } from '@/db';
import { cloudAuditLog } from '@/db/schema';

/**
 * Append a record to the Cloud audit log.
 *
 * Use from server actions only — the helper reads `headers()` which is a
 * server-only API. Failures are swallowed and logged so audit writes can never
 * break a user-visible flow; if you need write-guarantee, gate the calling
 * action behind a write transaction yourself.
 */
export async function appendAudit(params: {
  customerId: number;
  actorEmail: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  let ipAddress: string | null = null;
  let userAgent: string | null = null;

  try {
    const h = await headers();
    ipAddress =
      h.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? h.get('x-real-ip')
      ?? null;
    userAgent = h.get('user-agent');
  } catch {
    // Outside a request context — leave both null.
  }

  try {
    await db.insert(cloudAuditLog).values({
      customerId: params.customerId,
      actorEmail: params.actorEmail,
      action: params.action,
      target: params.target ?? null,
      metadata: params.metadata ?? null,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.error('[audit] failed to write entry:', err instanceof Error ? err.message : err);
  }
}
