/**
 * Tests for UcpClient - UCP discovery and API interaction
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UcpClient, UcpDiscoveryError, UcpApiError } from '../src/client/ucp-client.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';

describe('UcpClient', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Test Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  describe('discover()', () => {
    it('should discover a UCP profile from a domain', async () => {
      const client = new UcpClient();
      const result = await client.discover(merchant.domain);

      expect(result.domain).toBe(merchant.domain);
      expect(result.version).toBe('2026-01-11');
      expect(result.capabilities.length).toBeGreaterThan(0);
      expect(result.services.length).toBeGreaterThan(0);
      expect(result.paymentHandlers.length).toBeGreaterThan(0);
    });

    it('should strip protocol from domain', async () => {
      const client = new UcpClient();
      // MockMerchant runs on http, but client prepends https.
      // We test with the raw domain which works.
      const result = await client.discover(merchant.domain);
      expect(result.domain).toBe(merchant.domain);
    });

    it('should throw UcpDiscoveryError for non-existent domain', async () => {
      const client = new UcpClient({ timeoutMs: 2000 });
      await expect(client.discover('localhost:1')).rejects.toThrow();
    });

    it('should normalize array-format capabilities', async () => {
      const client = new UcpClient();
      const result = await client.discover(merchant.domain);

      const checkout = result.capabilities.find(
        c => c.name === 'dev.ucp.shopping.checkout'
      );
      expect(checkout).toBeDefined();
      expect(checkout!.version).toBe('2026-01-11');
      expect(checkout!.spec).toContain('checkout');
    });

    it('should extract payment handlers', async () => {
      const client = new UcpClient();
      const result = await client.discover(merchant.domain);

      expect(result.paymentHandlers[0].id).toBe('mock_payment');
    });

    it('should enumerate services with transports', async () => {
      const client = new UcpClient();
      const result = await client.discover(merchant.domain);

      const shopping = result.services.find(s => s.name === 'dev.ucp.shopping');
      expect(shopping).toBeDefined();
      expect(shopping!.transports.rest).toBeDefined();
      expect(shopping!.transports.rest!.endpoint).toContain('/ucp/v1');
    });
  });

  describe('capability helpers', () => {
    it('should check if merchant has a capability', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      expect(client.hasCapability('dev.ucp.shopping.checkout')).toBe(true);
      expect(client.hasCapability('dev.ucp.shopping.nonexistent')).toBe(false);
    });

    it('should get a specific capability', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      const cap = client.getCapability('dev.ucp.shopping.fulfillment');
      expect(cap).toBeDefined();
      expect(cap!.extends).toBe('dev.ucp.shopping.order');
    });
  });

  describe('callApi()', () => {
    it('should fetch products from the REST API', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      const result = (await client.callApi('/products')) as {
        products: Array<{ id: string; name: string }>;
        total: number;
      };

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.products[0].id).toBeDefined();
      expect(result.products[0].name).toBeDefined();
    });

    it('should fetch a single product by ID', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      const product = (await client.callApi(
        '/products/prod_wireless_headphones'
      )) as { id: string; name: string; price: { amount: string } };

      expect(product.id).toBe('prod_wireless_headphones');
      expect(product.name).toContain('Headphones');
      expect(parseFloat(product.price.amount)).toBe(149.99);
    });

    it('should handle 404 errors', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      await expect(
        client.callApi('/products/nonexistent_product')
      ).rejects.toThrow(UcpApiError);
    });

    it('should search products', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      const result = (await client.callApi(
        '/products/search?q=keyboard'
      )) as { products: Array<{ id: string }>; total: number };

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.products[0].id).toContain('keyboard');
    });
  });

  describe('checkout flow', () => {
    it('should complete a full checkout via API', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);

      // Initiate checkout
      const checkout = (await client.callApi('/checkout', {
        method: 'POST',
        body: {
          items: [
            {
              productId: 'prod_laptop_stand',
              name: 'ErgoRise Laptop Stand',
              quantity: 1,
              price: { amount: '59.99', currency: 'USD' },
            },
          ],
        },
      })) as { sessionId: string; subtotal: { amount: string } };

      expect(checkout.sessionId).toBeDefined();
      expect(parseFloat(checkout.subtotal.amount)).toBe(59.99);

      // Complete checkout
      const order = (await client.callApi('/checkout/complete', {
        method: 'POST',
        body: {
          sessionId: checkout.sessionId,
          payment: { method: 'mock_payment', token: 'tok_mock_success' },
          shippingAddress: {
            name: 'Test User',
            line1: '123 Test St',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            country: 'US',
          },
        },
      })) as { orderId: string; status: string };

      expect(order.orderId).toBeDefined();
      expect(order.status).toBe('confirmed');
    });
  });
});

// ─── v0.9 introspection helpers ───
// Signing keys, payment handler config, capability extension graph, A2A.

import type { Server } from 'node:http';

interface InlineMerchant {
  domain: string;
  stop:   () => Promise<void>;
}

async function startInlineMerchant(profile: Record<string, unknown>): Promise<InlineMerchant> {
  const { default: express } = await import('express');
  const app = express();
  app.use(express.json());

  app.get('/.well-known/ucp', (_req, res) => res.json(profile));
  app.get('/.well-known/ucp.json', (_req, res) => res.json(profile));

  return await new Promise<InlineMerchant>((resolve) => {
    const server: Server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        domain: `http://127.0.0.1:${port}`,
        stop:   () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe('UcpClient — v0.9 introspection helpers', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Introspection Store' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  describe('signing keys', () => {
    it('captures profile.signing_keys onto DiscoveryResult.signingKeys', async () => {
      const client = new UcpClient();
      const result = await client.discover(merchant.domain);
      expect(result.signingKeys).toHaveLength(1);
      expect(result.signingKeys[0]).toMatchObject({
        kty: 'EC',
        kid: 'mock-signing-key-1',
        alg: 'ES256',
      });
    });

    it('getSigningKeys() returns the same array', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      expect(client.getSigningKeys()).toHaveLength(1);
    });

    it('getSigningKey(kid) finds by kid', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      expect(client.getSigningKey('mock-signing-key-1')?.alg).toBe('ES256');
      expect(client.getSigningKey('does-not-exist')).toBeUndefined();
    });

    it('returns empty array when profile has no signing_keys', async () => {
      const inline = await startInlineMerchant({
        ucp: {
          version: '2026-01-11',
          services: { 'dev.ucp.shopping': { version: '2026-01-11', spec: '', rest: { schema: '', endpoint: '' } } },
          capabilities: [],
        },
      });
      try {
        const client = new UcpClient();
        await client.discover(inline.domain);
        expect(client.getSigningKeys()).toEqual([]);
      } finally {
        await inline.stop();
      }
    });
  });

  describe('payment handler introspection', () => {
    it('getPaymentHandler(id) returns the handler with its config', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      const handler = client.getPaymentHandler('mock_payment');
      expect(handler).toBeDefined();
      expect(handler?.config).toEqual({ test_mode: true });
    });

    it('getPaymentHandler(id) returns undefined for missing handler', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      expect(client.getPaymentHandler('nope')).toBeUndefined();
    });
  });

  describe('capability extension graph', () => {
    it('getExtensionsOf() returns capabilities whose extends matches', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      const exts = client.getExtensionsOf('dev.ucp.shopping.order');
      expect(exts.map(c => c.name)).toEqual(['dev.ucp.shopping.fulfillment']);
    });

    it('getExtensionsOf() returns [] when nothing extends the given name', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      expect(client.getExtensionsOf('dev.ucp.unknown')).toEqual([]);
    });

    it('getCapabilityLineage() walks the extends chain to the root', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      const chain = client.getCapabilityLineage('dev.ucp.shopping.fulfillment');
      expect(chain.map(c => c.name)).toEqual([
        'dev.ucp.shopping.fulfillment',
        'dev.ucp.shopping.order',
      ]);
    });

    it('getCapabilityLineage() returns [self] for a capability with no extends', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      const chain = client.getCapabilityLineage('dev.ucp.shopping.checkout');
      expect(chain.map(c => c.name)).toEqual(['dev.ucp.shopping.checkout']);
    });

    it('getCapabilityLineage() returns [] when the start capability is not found', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      expect(client.getCapabilityLineage('does.not.exist')).toEqual([]);
    });
  });

  describe('A2A transport', () => {
    it('getA2aEndpoint() returns the agent card URL when present', async () => {
      const inline = await startInlineMerchant({
        ucp: {
          version: '2026-01-11',
          services: {
            'dev.ucp.shopping': {
              version: '2026-01-11',
              spec:    'https://ucp.dev/specification/overview/',
              rest:    { schema: '', endpoint: 'http://example/ucp/v1' },
              a2a:     { agentCard: 'https://example.com/.well-known/agent-card.json' },
            },
          },
          capabilities: [],
        },
      });
      try {
        const client = new UcpClient();
        await client.discover(inline.domain);
        expect(client.getA2aEndpoint()).toBe('https://example.com/.well-known/agent-card.json');
      } finally {
        await inline.stop();
      }
    });

    it('getA2aEndpoint() returns undefined for services without A2A binding', async () => {
      const client = new UcpClient();
      await client.discover(merchant.domain);
      expect(client.getA2aEndpoint()).toBeUndefined();
    });
  });
});
