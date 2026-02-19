/**
 * Tests for MockMerchant - UCP-compliant test server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import { DEFAULT_PRODUCTS } from '../src/mock/fixtures.js';

describe('MockMerchant', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Test Merchant' });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  describe('server lifecycle', () => {
    it('should start and assign a port', () => {
      expect(merchant.baseUrl).toMatch(/^http:\/\/localhost:\d+$/);
    });

    it('should respond to health check', async () => {
      const res = await fetch(`${merchant.baseUrl}/health`);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.merchant).toBe('Test Merchant');
    });
  });

  describe('UCP profile', () => {
    it('should serve UCP profile at /.well-known/ucp', async () => {
      const res = await fetch(`${merchant.baseUrl}/.well-known/ucp`);
      expect(res.ok).toBe(true);

      const profile = await res.json();
      expect(profile.ucp).toBeDefined();
      expect(profile.ucp.version).toBe('2026-01-11');
      expect(profile.ucp.services['dev.ucp.shopping']).toBeDefined();
      expect(profile.ucp.capabilities).toBeInstanceOf(Array);
      expect(profile.payment).toBeDefined();
      expect(profile.signing_keys).toBeInstanceOf(Array);
    });

    it('should also serve at /.well-known/ucp.json', async () => {
      const res = await fetch(`${merchant.baseUrl}/.well-known/ucp.json`);
      expect(res.ok).toBe(true);
      const profile = await res.json();
      expect(profile.ucp.version).toBe('2026-01-11');
    });

    it('should include REST endpoint pointing to the server', async () => {
      const res = await fetch(`${merchant.baseUrl}/.well-known/ucp`);
      const profile = await res.json();
      const service = profile.ucp.services['dev.ucp.shopping'];
      expect(service.rest.endpoint).toBe(`${merchant.baseUrl}/ucp/v1`);
    });
  });

  describe('OpenAPI schema', () => {
    it('should serve OpenAPI schema', async () => {
      const res = await fetch(`${merchant.baseUrl}/ucp/schema/openapi.json`);
      expect(res.ok).toBe(true);
      const schema = await res.json();
      expect(schema.openapi).toBe('3.1.0');
      expect(schema.paths['/products']).toBeDefined();
    });
  });

  describe('product API', () => {
    it('should list all products', async () => {
      const res = await fetch(`${merchant.baseUrl}/ucp/v1/products`);
      const data = await res.json();
      expect(data.products.length).toBe(DEFAULT_PRODUCTS.length);
      expect(data.total).toBe(DEFAULT_PRODUCTS.length);
    });

    it('should filter by category', async () => {
      const res = await fetch(
        `${merchant.baseUrl}/ucp/v1/products?category=Electronics`
      );
      const data = await res.json();
      expect(data.products.length).toBeGreaterThan(0);
      for (const p of data.products) {
        expect(p.category).toBe('Electronics');
      }
    });

    it('should search products', async () => {
      const res = await fetch(
        `${merchant.baseUrl}/ucp/v1/products/search?q=wireless`
      );
      const data = await res.json();
      expect(data.products.length).toBeGreaterThan(0);
      expect(data.query).toBe('wireless');
    });

    it('should get a product by ID', async () => {
      const res = await fetch(
        `${merchant.baseUrl}/ucp/v1/products/prod_webcam`
      );
      const data = await res.json();
      expect(data.id).toBe('prod_webcam');
      expect(data.name).toContain('Webcam');
    });

    it('should return 404 for unknown product', async () => {
      const res = await fetch(
        `${merchant.baseUrl}/ucp/v1/products/nonexistent`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('checkout flow', () => {
    it('should reject empty cart checkout', async () => {
      const res = await fetch(`${merchant.baseUrl}/ucp/v1/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      });
      expect(res.status).toBe(400);
    });

    it('should initiate checkout with items', async () => {
      const res = await fetch(`${merchant.baseUrl}/ucp/v1/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              productId: 'prod_usb_hub',
              name: 'ConnectAll USB-C Hub',
              quantity: 2,
              price: { amount: '39.99', currency: 'USD' },
            },
          ],
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.sessionId).toBeDefined();
      expect(parseFloat(data.subtotal.amount)).toBe(79.98);
      expect(data.shipping.options).toBeInstanceOf(Array);
    });

    it('should complete checkout and create order', async () => {
      // Initiate
      const initRes = await fetch(`${merchant.baseUrl}/ucp/v1/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              productId: 'prod_desk_mat',
              name: 'WorkPad XL Desk Mat',
              quantity: 1,
              price: { amount: '29.99', currency: 'USD' },
            },
          ],
        }),
      });
      const initData = await initRes.json();

      // Complete
      const completeRes = await fetch(
        `${merchant.baseUrl}/ucp/v1/checkout/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: initData.sessionId,
            payment: { method: 'mock_payment', token: 'tok_mock_success' },
            shippingAddress: {
              name: 'Jane Doe',
              line1: '456 Oak Ave',
              city: 'Austin',
              state: 'TX',
              postalCode: '73301',
              country: 'US',
            },
          }),
        }
      );

      expect(completeRes.ok).toBe(true);
      const orderData = await completeRes.json();
      expect(orderData.orderId).toBeDefined();
      expect(orderData.status).toBe('confirmed');
      expect(orderData.order.items).toHaveLength(1);

      // Verify order is retrievable
      const orderRes = await fetch(
        `${merchant.baseUrl}/ucp/v1/orders/${orderData.orderId}`
      );
      expect(orderRes.ok).toBe(true);
      const retrieved = await orderRes.json();
      expect(retrieved.order.id).toBe(orderData.orderId);
    });

    it('should reject payment with failure token', async () => {
      const res = await fetch(
        `${merchant.baseUrl}/ucp/v1/checkout/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                productId: 'prod_cable_organizer',
                quantity: 1,
                price: { amount: '12.99', currency: 'USD' },
              },
            ],
            payment: { method: 'mock_payment', token: 'tok_mock_failure' },
          }),
        }
      );
      expect(res.status).toBe(402);
    });
  });

  describe('custom products', () => {
    it('should use custom product catalog', async () => {
      const custom = new MockMerchant({
        products: [
          {
            id: 'custom_1',
            name: 'Custom Product',
            description: 'A test product',
            price: { amount: '9.99', currency: 'EUR' },
          },
        ],
      });
      await custom.start();

      const res = await fetch(`${custom.baseUrl}/ucp/v1/products`);
      const data = await res.json();
      expect(data.products).toHaveLength(1);
      expect(data.products[0].id).toBe('custom_1');
      expect(data.products[0].price.currency).toBe('EUR');

      await custom.stop();
    });
  });

  describe('reset()', () => {
    it('should clear orders on reset', async () => {
      // Place an order first
      await fetch(`${merchant.baseUrl}/ucp/v1/checkout/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              productId: 'prod_phone_charger',
              quantity: 1,
              price: { amount: '24.99', currency: 'USD' },
            },
          ],
          payment: { method: 'mock', token: 'tok_mock_success' },
        }),
      });

      expect(merchant.getOrders().length).toBeGreaterThan(0);
      merchant.reset();
      expect(merchant.getOrders()).toHaveLength(0);
    });
  });
});
