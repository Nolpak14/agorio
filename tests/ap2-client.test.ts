/**
 * Tests for Ap2Client — Agent Payments Protocol (experimental)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  Ap2Client,
  Ap2Error,
  type IntentMandate,
  type CartMandate,
  type CartLineItem,
  type SignedMandate,
} from '../src/client/ap2-client.js';

const MERCHANT_ID = 'merchant_test_001';
const PAYMENT_URL = 'https://payments.example.com/ap2/submit';

function makeClient(overrides: Partial<ConstructorParameters<typeof Ap2Client>[0]> = {}) {
  return new Ap2Client({ merchantId: MERCHANT_ID, ...overrides });
}

const sampleLineItems: CartLineItem[] = [
  { productId: 'p1', name: 'Running Shoes', quantity: 1, unitPrice: '89.99', currency: 'USD' },
  { productId: 'p2', name: 'Socks',         quantity: 2, unitPrice: '5.00',  currency: 'USD' },
];

function makeFetch(ok: boolean, body: unknown): typeof globalThis.fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  })) as unknown as typeof globalThis.fetch;
}

describe('Ap2Client — IntentMandate', () => {
  it('creates a mandate with correct merchantId', () => {
    const client = makeClient();
    const mandate = client.createIntentMandate({ amount: '99.99', currency: 'USD' });
    expect(mandate.merchantId).toBe(MERCHANT_ID);
  });

  it('sets correct amount and currency', () => {
    const client = makeClient();
    const mandate = client.createIntentMandate({ amount: '49.00', currency: 'EUR' });
    expect(mandate.amount).toBe('49.00');
    expect(mandate.currency).toBe('EUR');
  });

  it('generates a unique mandateId with ap2_ prefix', () => {
    const client = makeClient();
    const m1 = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    const m2 = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    expect(m1.mandateId).toMatch(/^ap2_/);
    expect(m2.mandateId).toMatch(/^ap2_/);
    expect(m1.mandateId).not.toBe(m2.mandateId);
  });

  it('sets expiresAt in the future', () => {
    const before = Date.now();
    const client = makeClient();
    const mandate = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    expect(mandate.expiresAt).toBeGreaterThan(before);
  });

  it('respects custom mandateTtlMs', () => {
    const ttl = 60_000;
    const client = makeClient({ mandateTtlMs: ttl });
    const before = Date.now();
    const mandate = client.createIntentMandate({ amount: '1.00', currency: 'USD' });
    expect(mandate.expiresAt - before).toBeLessThanOrEqual(ttl + 50);
    expect(mandate.expiresAt - before).toBeGreaterThanOrEqual(ttl - 50);
  });

  it('sets createdAt as an ISO-8601 string', () => {
    const client = makeClient();
    const mandate = client.createIntentMandate({ amount: '5.00', currency: 'USD' });
    expect(() => new Date(mandate.createdAt)).not.toThrow();
    expect(mandate.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('Ap2Client — CartMandate', () => {
  it('attaches line items to an intent mandate', () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '99.99', currency: 'USD' });
    const cart = client.attachCart(intent, sampleLineItems);
    expect(cart.lineItems).toHaveLength(2);
    expect(cart.lineItems[0].productId).toBe('p1');
  });

  it('computes cartTotal from line items', () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '99.99', currency: 'USD' });
    // 1 × 89.99 + 2 × 5.00 = 99.99
    const cart = client.attachCart(intent, sampleLineItems);
    expect(cart.cartTotal).toBe('99.99');
  });

  it('preserves all intent fields in cart mandate', () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '50.00', currency: 'USD' });
    const cart = client.attachCart(intent, [
      { productId: 'x', name: 'Widget', quantity: 2, unitPrice: '25.00', currency: 'USD' },
    ]);
    expect(cart.mandateId).toBe(intent.mandateId);
    expect(cart.merchantId).toBe(intent.merchantId);
    expect(cart.expiresAt).toBe(intent.expiresAt);
  });
});

describe('Ap2Client — signing', () => {
  it('produces a mock signature with mock_sig_ prefix', async () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    const cart = client.attachCart(intent, sampleLineItems);
    const signed = await client.sign(cart);
    expect(signed.signature).toMatch(/^mock_sig_/);
  });

  it('sets algorithm to mock-sha256 for default signer', async () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    const signed = await client.sign(intent);
    expect(signed.algorithm).toBe('mock-sha256');
  });

  it('sets keyId to mock-key-0 by default', async () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    const signed = await client.sign(intent);
    expect(signed.keyId).toBe('mock-key-0');
  });

  it('uses custom signer when provided', async () => {
    const customSign = vi.fn(async () => 'custom_signature_abc');
    const client = makeClient({ sign: customSign, keyId: 'hw-key-1' });
    const intent = client.createIntentMandate({ amount: '20.00', currency: 'USD' });
    const signed = await client.sign(intent);
    expect(customSign).toHaveBeenCalledOnce();
    expect(signed.signature).toBe('custom_signature_abc');
    expect(signed.keyId).toBe('hw-key-1');
  });

  it('produces deterministic signatures for the same payload', async () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    const cart = client.attachCart(intent, sampleLineItems);
    const s1 = await client.sign(cart);
    const s2 = await client.sign(cart);
    expect(s1.signature).toBe(s2.signature);
  });
});

describe('Ap2Client — submitPayment', () => {
  it('returns success result on 200 response', async () => {
    const fetchFn = makeFetch(true, { transactionId: 'txn_123' });
    const client = makeClient({ fetch: fetchFn });
    const intent = client.createIntentMandate({ amount: '99.99', currency: 'USD' });
    const cart = client.attachCart(intent, sampleLineItems);
    const signed = await client.sign(cart);
    const result = await client.submitPayment(signed, PAYMENT_URL);

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('txn_123');
    expect(result.status).toBe('authorized');
  });

  it('returns error result on non-200 response', async () => {
    const fetchFn = makeFetch(false, { error: 'declined' });
    const client = makeClient({ fetch: fetchFn });
    const intent = client.createIntentMandate({ amount: '10.00', currency: 'USD' });
    const signed = await client.sign(intent);
    const result = await client.submitPayment(signed, PAYMENT_URL);

    expect(result.success).toBe(false);
    expect(result.status).toBe('error');
  });

  it('sends correct AP2 headers', async () => {
    const fetchFn = makeFetch(true, { transactionId: 'txn_456' });
    const client = makeClient({ fetch: fetchFn });
    const intent = client.createIntentMandate({ amount: '1.00', currency: 'USD' });
    const signed = await client.sign(intent);
    await client.submitPayment(signed, PAYMENT_URL);

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(PAYMENT_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['X-AP2-Algorithm']).toBe('mock-sha256');
    expect(init.headers['X-AP2-Key-Id']).toBe('mock-key-0');
  });
});

describe('Ap2Client — isExpired', () => {
  it('returns false for a fresh mandate', () => {
    const client = makeClient();
    const intent = client.createIntentMandate({ amount: '5.00', currency: 'USD' });
    expect(client.isExpired(intent)).toBe(false);
  });

  it('returns true for an already-expired mandate', () => {
    const client = makeClient();
    const expired: IntentMandate = {
      mandateId: 'ap2_old',
      merchantId: MERCHANT_ID,
      amount: '5.00',
      currency: 'USD',
      expiresAt: Date.now() - 1000,
      createdAt: new Date().toISOString(),
    };
    expect(client.isExpired(expired)).toBe(true);
  });
});

describe('Ap2Client — pay (convenience method)', () => {
  it('runs the full flow and returns a payment result', async () => {
    const fetchFn = makeFetch(true, { transactionId: 'txn_full' });
    const client = makeClient({ fetch: fetchFn });

    const result = await client.pay({
      amount: '99.99',
      currency: 'USD',
      lineItems: sampleLineItems,
      paymentEndpoint: PAYMENT_URL,
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('txn_full');
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

describe('Ap2Error', () => {
  it('has correct name and message', () => {
    const err = new Ap2Error('mandate expired');
    expect(err.name).toBe('Ap2Error');
    expect(err.message).toBe('mandate expired');
    expect(err).toBeInstanceOf(Error);
  });
});
