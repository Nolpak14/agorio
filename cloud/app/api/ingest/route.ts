import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { apiKeys, traceRuns, traceSpans, traceLogs } from '@/db/schema';
import type {
  IngestBatch,
  LogRecord,
  RunEndPayload,
  RunStartPayload,
  SpanRecord,
} from '@agorio/sdk';

export const runtime = 'nodejs';

const KEY_CACHE = new Map<string, { customerId: number; apiKeyId: number; expiresAt: number }>();
const KEY_CACHE_TTL_MS = 60_000;
const LAST_USED_DEBOUNCE_MS = 60_000;
const LAST_USED_TOUCH = new Map<number, number>();

interface KeyLookup {
  customerId: number;
  apiKeyId: number;
}

async function lookupApiKey(token: string): Promise<KeyLookup | null> {
  const now = Date.now();
  const cached = KEY_CACHE.get(token);
  if (cached && cached.expiresAt > now) {
    return { customerId: cached.customerId, apiKeyId: cached.apiKeyId };
  }

  const [row] = await db
    .select({ id: apiKeys.id, customerId: apiKeys.customerId })
    .from(apiKeys)
    .where(and(eq(apiKeys.key, token), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) {
    KEY_CACHE.delete(token);
    return null;
  }

  KEY_CACHE.set(token, {
    customerId: row.customerId,
    apiKeyId: row.id,
    expiresAt: now + KEY_CACHE_TTL_MS,
  });
  return { customerId: row.customerId, apiKeyId: row.id };
}

function touchLastUsed(apiKeyId: number): void {
  const now = Date.now();
  const last = LAST_USED_TOUCH.get(apiKeyId) ?? 0;
  if (now - last < LAST_USED_DEBOUNCE_MS) return;
  LAST_USED_TOUCH.set(apiKeyId, now);
  // Fire-and-forget — do not await; never block ingestion on a metadata update.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(now) })
    .where(eq(apiKeys.id, apiKeyId))
    .catch(() => {});
}

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const token = bearer(req);
    if (!token) return unauthorized();

    const lookup = await lookupApiKey(token);
    if (!lookup) return unauthorized();

    touchLastUsed(lookup.apiKeyId);

    const batch = (await req.json()) as IngestBatch;
    if (!batch || typeof batch !== 'object' || !batch.traceId || !batch.runId) {
      return NextResponse.json({ error: 'invalid_batch' }, { status: 400 });
    }

    switch (batch.batchType) {
      case 'run_start': {
        const payload = batch.payload as RunStartPayload | undefined;
        if (!payload) break;
        // Upsert pattern: ignore conflict if the run row already exists.
        await db
          .insert(traceRuns)
          .values({
            id: batch.runId,
            apiKeyId: lookup.apiKeyId,
            customerId: lookup.customerId,
            task: payload.task,
            status: 'in_progress',
            startedAt: new Date(payload.startedAt),
            sdkVersion: payload.sdkVersion,
          })
          .onConflictDoNothing({ target: traceRuns.id });
        break;
      }

      case 'spans': {
        const events = (batch.events as SpanRecord[] | undefined) ?? [];
        if (events.length === 0) break;
        await db.insert(traceSpans).values(
          events.map((e) => ({
            runId: batch.runId,
            name: e.name,
            attributes: e.attributes ?? null,
            startedAt: new Date(e.startedAt),
            endedAt: new Date(e.endedAt),
            durationMs: e.durationMs,
          }))
        );
        break;
      }

      case 'logs': {
        const events = (batch.events as LogRecord[] | undefined) ?? [];
        if (events.length === 0) break;
        await db.insert(traceLogs).values(
          events.map((e) => ({
            runId: batch.runId,
            level: e.level,
            message: e.message,
            data: e.data ?? null,
            timestamp: new Date(e.timestamp),
          }))
        );
        break;
      }

      case 'run_end': {
        const payload = batch.payload as RunEndPayload | undefined;
        if (!payload) break;
        await db
          .update(traceRuns)
          .set({
            status: payload.status,
            endedAt: new Date(payload.endedAt),
            totalLatencyMs: payload.usage?.totalLatencyMs ?? null,
            totalTokens: payload.usage?.totalTokens ?? null,
            promptTokens: payload.usage?.promptTokens ?? null,
            completionTokens: payload.usage?.completionTokens ?? null,
            llmCalls: payload.usage?.llmCalls ?? null,
            toolCalls: payload.usage?.toolCalls ?? null,
            finalAnswer: payload.finalAnswer ?? null,
            error: payload.error ?? null,
          })
          .where(eq(traceRuns.id, batch.runId));
        break;
      }

      default:
        return NextResponse.json({ error: 'unknown_batch_type' }, { status: 400 });
    }

    return new NextResponse(null, { status: 202 });
  } catch (err) {
    console.error('[ingest] unexpected error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'ingest_failed' }, { status: 500 });
  }
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 405 });
}
