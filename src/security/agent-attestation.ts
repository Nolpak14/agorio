/**
 * Agent Identity Attestation
 *
 * Lets an agorio agent prove cryptographically that an outgoing request came
 * from an authorized agent, and lets merchants verify those attestations
 * without sharing private keys.
 *
 * The default scheme is HMAC-SHA256 over a canonical request envelope:
 *
 *     <agentId>\n<timestamp>\n<nonce>\n<method>\n<url>\n<sha256(body)>
 *
 * The signature is sent as a single header:
 *
 *     X-Agorio-Attestation: v=1; agent=<agentId>; ts=<unix>; nonce=<hex>; sig=<hex>
 *
 * Merchants verify by recomputing the HMAC with their shared secret and
 * checking the timestamp is within the allowed clock skew window.
 *
 * This is intentionally simpler than mTLS or signed JWTs and works in
 * Fluid Compute / Edge / Node 20+ without extra dependencies. For higher
 * assurance, pair this with a public-key signature scheme by passing a
 * custom `sign` function.
 */

import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export interface AttestationOptions {
  /** Stable agent identifier ("agent_org_team_purpose") */
  agentId: string;
  /** Pre-shared secret with the merchant (HMAC key). Required unless `sign` is supplied. */
  secret?: string;
  /**
   * Optional custom signer — receives the canonical envelope string and returns a hex signature.
   * Use this to swap in ed25519 / WebAuthn / KMS-backed signing.
   */
  sign?: (canonical: string) => Promise<string> | string;
  /** Default skew tolerance for verification (seconds). Default: 300 (5 min). */
  clockSkewSec?: number;
}

export interface SignRequestInput {
  method: string;
  url: string;
  body?: string | Buffer | undefined;
  /** Override timestamp (seconds since epoch) — defaults to now */
  timestamp?: number;
  /** Override nonce — defaults to a fresh 16-byte hex string */
  nonce?: string;
}

export interface ParsedAttestation {
  version: '1';
  agentId: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

export type VerifyResult =
  | { ok: true; agentId: string; timestamp: number; nonce: string }
  | { ok: false; reason: string };

const HEADER_NAME = 'X-Agorio-Attestation';

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalEnvelope(input: {
  agentId: string;
  timestamp: number;
  nonce: string;
  method: string;
  url: string;
  bodyHash: string;
}): string {
  return [
    input.agentId,
    String(input.timestamp),
    input.nonce,
    input.method.toUpperCase(),
    input.url,
    input.bodyHash,
  ].join('\n');
}

export class AgentAttestation {
  private readonly agentId: string;
  private readonly secret: string | undefined;
  private readonly signer: ((canonical: string) => Promise<string> | string) | undefined;
  private readonly clockSkewSec: number;

  constructor(options: AttestationOptions) {
    if (!options.agentId) {
      throw new Error('AgentAttestation: agentId is required');
    }
    if (!options.secret && !options.sign) {
      throw new Error('AgentAttestation: either secret or sign must be provided');
    }
    this.agentId = options.agentId;
    this.secret = options.secret;
    this.signer = options.sign;
    this.clockSkewSec = options.clockSkewSec ?? 300;
  }

  /** Header name the SDK and merchant agree on. */
  static readonly headerName = HEADER_NAME;

  /**
   * Compute the attestation header value for an outgoing request.
   * Returns a string ready to be set as `X-Agorio-Attestation`.
   */
  async signRequest(input: SignRequestInput): Promise<string> {
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
    const nonce = input.nonce ?? randomBytes(16).toString('hex');
    const bodyBytes = input.body ?? '';
    const bodyHash = sha256Hex(bodyBytes);

    const envelope = canonicalEnvelope({
      agentId: this.agentId,
      timestamp,
      nonce,
      method: input.method,
      url: input.url,
      bodyHash,
    });

    const signature = this.signer
      ? await this.signer(envelope)
      : createHmac('sha256', this.secret!).update(envelope).digest('hex');

    return `v=1; agent=${this.agentId}; ts=${timestamp}; nonce=${nonce}; sig=${signature}`;
  }

  /**
   * Wrap a fetch implementation to attach the attestation header automatically.
   * The wrapped fetch sets `X-Agorio-Attestation` on every outgoing request.
   */
  wrapFetch(baseFetch: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
    const self = this;
    return (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as { url: string }).url;
      const reqMethod = typeof input === 'object' && input !== null && 'method' in input
        ? (input as { method?: string }).method
        : undefined;
      const method = init?.method ?? reqMethod ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : init?.body == null ? '' : '';
      const header = await self.signRequest({ method, url, body });

      const headers = new Headers(init?.headers ?? {});
      headers.set(HEADER_NAME, header);

      return baseFetch(input, { ...init, headers });
    }) as typeof globalThis.fetch;
  }
}

/**
 * Parse an `X-Agorio-Attestation` header value into its components.
 * Returns null if the header is malformed.
 */
export function parseAttestation(header: string | null | undefined): ParsedAttestation | null {
  if (!header) return null;
  const parts = header.split(';').map(s => s.trim()).filter(Boolean);
  const fields: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    fields[key] = value;
  }
  if (fields.v !== '1') return null;
  if (!fields.agent || !fields.ts || !fields.nonce || !fields.sig) return null;
  const timestamp = Number(fields.ts);
  if (!Number.isFinite(timestamp)) return null;
  return {
    version: '1',
    agentId: fields.agent,
    timestamp,
    nonce: fields.nonce,
    signature: fields.sig,
  };
}

export interface VerifyOptions {
  /** Lookup the HMAC secret for a given agentId. Return null to reject. */
  resolveSecret: (agentId: string) => string | null | Promise<string | null>;
  /** Allowed clock skew in seconds (default: 300) */
  clockSkewSec?: number;
  /** Provide a custom now (in seconds) for testing */
  now?: () => number;
}

/**
 * Verify an attestation header against a request envelope.
 * Returns `{ ok: true }` and the parsed agent identity on success.
 */
export async function verifyAttestation(
  request: {
    method: string;
    url: string;
    body?: string | Buffer;
    header: string | null | undefined;
  },
  options: VerifyOptions
): Promise<VerifyResult> {
  const parsed = parseAttestation(request.header);
  if (!parsed) return { ok: false, reason: 'malformed attestation header' };

  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSec ?? 300;
  if (Math.abs(now - parsed.timestamp) > skew) {
    return { ok: false, reason: 'timestamp outside skew window' };
  }

  const secret = await options.resolveSecret(parsed.agentId);
  if (!secret) return { ok: false, reason: 'unknown agentId' };

  const bodyHash = sha256Hex(request.body ?? '');
  const envelope = canonicalEnvelope({
    agentId: parsed.agentId,
    timestamp: parsed.timestamp,
    nonce: parsed.nonce,
    method: request.method,
    url: request.url,
    bodyHash,
  });

  const expected = createHmac('sha256', secret).update(envelope).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(parsed.signature, 'hex');
  } catch {
    return { ok: false, reason: 'signature is not hex' };
  }
  if (actual.length !== expected.length) {
    return { ok: false, reason: 'signature length mismatch' };
  }
  if (!timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'signature mismatch' };
  }

  return { ok: true, agentId: parsed.agentId, timestamp: parsed.timestamp, nonce: parsed.nonce };
}
