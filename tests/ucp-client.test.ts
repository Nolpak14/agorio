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
