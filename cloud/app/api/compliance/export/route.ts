/**
 * EU AI Act compliance export endpoint.
 *
 * Returns an audit-grade record set for a date range — runs, spans, and logs
 * for the authenticated customer — in either CSV or JSON. Endpoint metadata
 * fields are aligned with Annex IV of the EU AI Act (system inputs, outputs,
 * timestamps, model identity, and human review markers) so the export can be
 * filed directly with internal compliance teams or regulators.
 *
 * Auth: same Neon Auth session used by the dashboard. Customers can only
 * export their own data. Date range is required and capped at 90 days per
 * request to keep result sets bounded.
 *
 * Query params:
 *   from=2026-04-01            (required, ISO date)
 *   to=2026-04-30              (required, ISO date, inclusive)
 *   format=csv|json            (default: csv)
 *   include=runs,spans,logs    (default: runs)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, gte, lte, inArray, asc } from 'drizzle-orm';
import { db } from '@/db';
import { traceRuns, traceSpans, traceLogs } from '@/db/schema';
import { getCurrentCustomer } from '@/lib/customer';
import { appendAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const MAX_RANGE_DAYS = 90;
const VALID_INCLUDES = new Set(['runs', 'spans', 'logs']);

function badRequest(reason: string, status = 400): NextResponse {
  return NextResponse.json({ error: reason }, { status });
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map(csvEscape).join(',');
  const lines = rows.map(row => columns.map(c => csvEscape(row[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getCurrentCustomer();
  if (!session?.customer) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const customerId = session.customer.id;

  const { searchParams } = req.nextUrl;
  const from = parseDate(searchParams.get('from'));
  const to = parseDate(searchParams.get('to'));
  if (!from || !to) {
    return badRequest('from and to are required ISO dates (e.g. 2026-04-01)');
  }
  if (to.getTime() < from.getTime()) {
    return badRequest('"to" must be on or after "from"');
  }
  const rangeMs = to.getTime() - from.getTime();
  if (rangeMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return badRequest(`date range capped at ${MAX_RANGE_DAYS} days per export`);
  }

  // Make `to` end-of-day inclusive
  const toInclusive = new Date(to);
  toInclusive.setUTCHours(23, 59, 59, 999);

  const format = (searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return badRequest('format must be csv or json');
  }

  const includeRaw = (searchParams.get('include') ?? 'runs').toLowerCase();
  const include = new Set(includeRaw.split(',').map(s => s.trim()).filter(Boolean));
  for (const v of include) {
    if (!VALID_INCLUDES.has(v)) return badRequest(`invalid include value: ${v}`);
  }
  if (include.size === 0) include.add('runs');

  // Always fetch runs scoped to this customer — used to authorize spans/logs.
  const runs = await db
    .select()
    .from(traceRuns)
    .where(
      and(
        eq(traceRuns.customerId, customerId),
        gte(traceRuns.startedAt, from),
        lte(traceRuns.startedAt, toInclusive)
      )
    )
    .orderBy(asc(traceRuns.startedAt));

  const runIds = runs.map(r => r.id);

  const spans = include.has('spans') && runIds.length > 0
    ? await db
        .select()
        .from(traceSpans)
        .where(inArray(traceSpans.runId, runIds))
        .orderBy(asc(traceSpans.startedAt))
    : [];

  const logs = include.has('logs') && runIds.length > 0
    ? await db
        .select()
        .from(traceLogs)
        .where(inArray(traceLogs.runId, runIds))
        .orderBy(asc(traceLogs.timestamp))
    : [];

  const exportedAt = new Date().toISOString();
  const filenameBase = `agorio-compliance-${from.toISOString().slice(0, 10)}-to-${to
    .toISOString()
    .slice(0, 10)}`;

  await appendAudit({
    customerId,
    actorEmail: session.email,
    action: 'compliance.export',
    target: filenameBase,
    metadata: {
      format,
      include: Array.from(include),
      from: from.toISOString(),
      to: toInclusive.toISOString(),
      runCount: runs.length,
    },
  });

  if (format === 'json') {
    const body = {
      // Annex IV header — high-risk-AI system documentation
      exportMetadata: {
        spec: 'EU AI Act Annex IV — agorio compliance export v1',
        customerId,
        exportedAt,
        rangeStart: from.toISOString(),
        rangeEnd: toInclusive.toISOString(),
        recordCounts: {
          runs: runs.length,
          spans: spans.length,
          logs: logs.length,
        },
      },
      runs: include.has('runs') ? runs : undefined,
      spans: include.has('spans') ? spans : undefined,
      logs: include.has('logs') ? logs : undefined,
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
        'X-Agorio-Export-Spec': 'EU-AI-Act-Annex-IV-v1',
      },
    });
  }

  // CSV — emit one section per included table, separated by blank lines
  const parts: string[] = [];
  parts.push(
    `# agorio compliance export (EU AI Act Annex IV v1)\n# exported_at=${exportedAt} customer_id=${customerId} range=${from
      .toISOString()
      .slice(0, 10)}..${to.toISOString().slice(0, 10)}\n`
  );

  if (include.has('runs')) {
    parts.push('# runs');
    parts.push(
      toCsv(
        runs.map(r => ({
          id: r.id,
          task: r.task,
          status: r.status,
          started_at: r.startedAt?.toISOString(),
          ended_at: r.endedAt?.toISOString() ?? '',
          total_latency_ms: r.totalLatencyMs ?? '',
          total_tokens: r.totalTokens ?? '',
          prompt_tokens: r.promptTokens ?? '',
          completion_tokens: r.completionTokens ?? '',
          llm_calls: r.llmCalls ?? '',
          tool_calls: r.toolCalls ?? '',
          final_answer: r.finalAnswer ?? '',
          error: r.error ?? '',
          sdk_version: r.sdkVersion ?? '',
        })),
        [
          'id',
          'task',
          'status',
          'started_at',
          'ended_at',
          'total_latency_ms',
          'total_tokens',
          'prompt_tokens',
          'completion_tokens',
          'llm_calls',
          'tool_calls',
          'final_answer',
          'error',
          'sdk_version',
        ]
      )
    );
  }

  if (include.has('spans')) {
    parts.push('# spans');
    parts.push(
      toCsv(
        spans.map(s => ({
          run_id: s.runId,
          name: s.name,
          started_at: s.startedAt?.toISOString(),
          ended_at: s.endedAt?.toISOString(),
          duration_ms: s.durationMs,
          attributes: s.attributes ?? '',
        })),
        ['run_id', 'name', 'started_at', 'ended_at', 'duration_ms', 'attributes']
      )
    );
  }

  if (include.has('logs')) {
    parts.push('# logs');
    parts.push(
      toCsv(
        logs.map(l => ({
          run_id: l.runId,
          level: l.level,
          message: l.message,
          timestamp: l.timestamp?.toISOString(),
          data: l.data ?? '',
        })),
        ['run_id', 'level', 'message', 'timestamp', 'data']
      )
    );
  }

  return new NextResponse(parts.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      'X-Agorio-Export-Spec': 'EU-AI-Act-Annex-IV-v1',
    },
  });
}
