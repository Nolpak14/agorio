export function relativeTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const abs = Math.abs(diffMs);
  const dir = diffMs >= 0 ? 'ago' : 'from now';

  const s = Math.round(abs / 1000);
  if (s < 60) return `${s}s ${dir}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ${dir}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ${dir}`;
  const days = Math.round(h / 24);
  return `${days}d ${dir}`;
}

export function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 60_000).toFixed(2)} min`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}
