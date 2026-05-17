/**
 * Tests for AgentAttestation — HMAC-SHA256 agent identity attestation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AgentAttestation,
  parseAttestation,
  verifyAttestation,
} from '../src/security/agent-attestation.js';

const AGENT_ID = 'agent_acme_procurement_001';
const SECRET = 'shared-secret-do-not-leak';

describe('AgentAttestation — signing', () => {
  it('rejects construction without agentId', () => {
    expect(() => new AgentAttestation({ agentId: '', secret: SECRET })).toThrow();
  });

  it('rejects construction without secret or sign', () => {
    expect(() => new AgentAttestation({ agentId: AGENT_ID })).toThrow();
  });

  it('produces a header in the documented format', async () => {
    const att = new AgentAttestation({ agentId: AGENT_ID, secret: SECRET });
    const header = await att.signRequest({ method: 'POST', url: 'https://m.example.com/checkout' });
    expect(header).toMatch(/^v=1; agent=agent_acme_procurement_001; ts=\d+; nonce=[0-9a-f]+; sig=[0-9a-f]+$/);
  });

  it('produces deterministic signatures for identical inputs', async () => {
    const att = new AgentAttestation({ agentId: AGENT_ID, secret: SECRET });
    const a = await att.signRequest({
      method: 'POST',
      url: 'https://m.example.com/x',
      body: '{"q":1}',
      timestamp: 1700000000,
      nonce: 'fixed-nonce',
    });
    const b = await att.signRequest({
      method: 'POST',
      url: 'https://m.example.com/x',
      body: '{"q":1}',
      timestamp: 1700000000,
      nonce: 'fixed-nonce',
    });
    expect(a).toBe(b);
  });

  it('hashes body so a different body yields a different signature', async () => {
    const att = new AgentAttestation({ agentId: AGENT_ID, secret: SECRET });
    const a = await att.signRequest({
      method: 'POST', url: 'https://m.example.com/x', body: '{"q":1}',
      timestamp: 1, nonce: 'n',
    });
    const b = await att.signRequest({
      method: 'POST', url: 'https://m.example.com/x', body: '{"q":2}',
      timestamp: 1, nonce: 'n',
    });
    expect(a).not.toBe(b);
  });

  it('supports a custom signer (replaces HMAC)', async () => {
    const customSign = vi.fn(async () => 'deadbeef'.repeat(8));
    const att = new AgentAttestation({ agentId: AGENT_ID, sign: customSign });
    const header = await att.signRequest({ method: 'GET', url: 'https://m.example.com/products' });
    expect(customSign).toHaveBeenCalled();
    expect(header).toContain('sig=' + 'deadbeef'.repeat(8));
  });

  it('wrapFetch attaches the attestation header to outgoing requests', async () => {
    const att = new AgentAttestation({ agentId: AGENT_ID, secret: SECRET });
    const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers ?? {});
      return new Response(h.get('X-Agorio-Attestation') ?? '', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const fetchFn = att.wrapFetch(baseFetch);
    const res = await fetchFn('https://m.example.com/check', { method: 'POST', body: '{}' });
    const echoed = await res.text();
    expect(echoed).toMatch(/^v=1; agent=agent_acme_procurement_001;/);
  });
});

describe('parseAttestation', () => {
  it('parses a well-formed header', async () => {
    const att = new AgentAttestation({ agentId: AGENT_ID, secret: SECRET });
    const header = await att.signRequest({ method: 'POST', url: 'https://m.example.com' });
    const parsed = parseAttestation(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.agentId).toBe(AGENT_ID);
    expect(parsed!.version).toBe('1');
  });

  it('returns null for missing or unknown version', () => {
    expect(parseAttestation(null)).toBeNull();
    expect(parseAttestation('')).toBeNull();
    expect(parseAttestation('v=2; agent=x; ts=1; nonce=n; sig=ff')).toBeNull();
  });

  it('returns null when fields are missing', () => {
    expect(parseAttestation('v=1; agent=x; ts=1; nonce=n')).toBeNull();
  });
});

describe('verifyAttestation', () => {
  async function buildSigned(overrides: Partial<{ body: string; method: string; url: string; ts: number }> = {}) {
    const att = new AgentAttestation({ agentId: AGENT_ID, secret: SECRET });
    const method = overrides.method ?? 'POST';
    const url = overrides.url ?? 'https://m.example.com/orders';
    const body = overrides.body ?? '{"item":"shoes"}';
    const header = await att.signRequest({
      method,
      url,
      body,
      ...(overrides.ts ? { timestamp: overrides.ts } : {}),
    });
    return { method, url, body, header };
  }

  it('accepts a freshly signed request', async () => {
    const { method, url, body, header } = await buildSigned();
    const result = await verifyAttestation(
      { method, url, body, header },
      { resolveSecret: id => (id === AGENT_ID ? SECRET : null) }
    );
    expect(result.ok).toBe(true);
  });

  it('rejects when the agentId is unknown', async () => {
    const { method, url, body, header } = await buildSigned();
    const result = await verifyAttestation(
      { method, url, body, header },
      { resolveSecret: () => null }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown agentId/);
  });

  it('rejects when body has been tampered with', async () => {
    const { method, url, header } = await buildSigned({ body: '{"item":"shoes"}' });
    const result = await verifyAttestation(
      { method, url, body: '{"item":"hijacked"}', header },
      { resolveSecret: () => SECRET }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/signature mismatch/);
  });

  it('rejects when the URL does not match', async () => {
    const { method, body, header } = await buildSigned({ url: 'https://m.example.com/orders' });
    const result = await verifyAttestation(
      { method, url: 'https://m.example.com/admin', body, header },
      { resolveSecret: () => SECRET }
    );
    expect(result.ok).toBe(false);
  });

  it('rejects timestamps outside the skew window', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 1000;
    const { method, url, body, header } = await buildSigned({ ts: oldTs });
    const result = await verifyAttestation(
      { method, url, body, header },
      { resolveSecret: () => SECRET, clockSkewSec: 60 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/skew/);
  });

  it('rejects malformed signatures', async () => {
    const result = await verifyAttestation(
      {
        method: 'POST',
        url: 'https://m.example.com',
        body: '',
        header: `v=1; agent=${AGENT_ID}; ts=${Math.floor(Date.now() / 1000)}; nonce=abc; sig=not-hex`,
      },
      { resolveSecret: () => SECRET }
    );
    expect(result.ok).toBe(false);
  });
});
