/**
 * Tests for AcpClient and MockAcpMerchant
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AcpClient, AcpApiError } from '../src/client/acp-client.js';
import { MockAcpMerchant } from '../src/mock/mock-acp-merchant.js';

describe('MockAcpMerchant', () => {
  let merchant: MockAcpMerchant;

  beforeAll(async () => {
    merchant = new MockAcpMerchant({ name: 'ACP Test Store' });
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
      expect(data.protocol).toBe('acp');
    });
  });

  describe('product API', () => {
    it('should list all products', async () => {
      const res = await fetch(`${merchant.baseUrl}/products`);
      const data = await res.json();
      expect(data.products.length).toBeGreaterThan(0);
      expect(data.total).toBeGreaterThan(0);
    });

    it('should search products', async () => {
      const res = await fetch(`${merchant.baseUrl}/products/search?q=headphones`);
      const data = await res.json();
      expect(data.products.length).toBeGreaterThan(0);
    });

    it('should get a product by ID', async () => {
      const res = await fetch(`${merchant.baseUrl}/products/prod_webcam`);
      const data = await res.json();
      expect(data.id).toBe('prod_webcam');
    });

    it('should return 404 for unknown product', async () => {
      const res = await fetch(`${merchant.baseUrl}/products/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe('ACP checkout (raw HTTP)', () => {
    it('should reject requests without auth', async () => {
      const res = await fetch(`${merchant.baseUrl}/checkout_sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: [{ product_id: 'prod_webcam', quantity: 1 }] }),
      });
      expect(res.status).toBe(401);
    });

    it('should create a checkout session with auth', async () => {
      const res = await fetch(`${merchant.baseUrl}/checkout_sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${merchant.requiredApiKey}`,
          'API-Version': '2026-01-30',
        },
        body: JSON.stringify({ line_items: [{ product_id: 'prod_webcam', quantity: 2 }] }),
      });
      expect(res.status).toBe(201);
      const session = await res.json();
      expect(session.id).toBeDefined();
      expect(session.status).toBe('not_ready_for_payment');
      expect(session.line_items).toHaveLength(1);
      expect(session.line_items[0].quantity).toBe(2);
      expect(session.totals.subtotal.amount).toBe(7999 * 2);
      expect(session.payment_handlers).toBeDefined();
      expect(session.links).toBeDefined();
    });
  });
});

describe('AcpClient', () => {
  let merchant: MockAcpMerchant;
  let client: AcpClient;

  beforeAll(async () => {
    merchant = new MockAcpMerchant({ name: 'ACP Client Test' });
    await merchant.start();
    client = new AcpClient({
      endpoint: merchant.acpEndpoint,
      apiKey: merchant.requiredApiKey,
    });
  });

  afterAll(async () => {
    await merchant.stop();
  });

  describe('createCheckout()', () => {
    it('should create a checkout session', async () => {
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_laptop_stand', quantity: 1 }],
      });

      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^cs_/);
      expect(session.status).toBe('not_ready_for_payment');
      expect(session.line_items).toHaveLength(1);
      expect(session.line_items[0].name).toContain('Laptop Stand');
      expect(session.totals.subtotal.amount).toBe(5999);
      expect(session.totals.subtotal.currency).toBe('USD');
    });

    it('should reject empty line items', async () => {
      await expect(
        client.createCheckout({ line_items: [] })
      ).rejects.toThrow(AcpApiError);
    });

    it('should reject unknown product IDs', async () => {
      await expect(
        client.createCheckout({ line_items: [{ product_id: 'nonexistent', quantity: 1 }] })
      ).rejects.toThrow(AcpApiError);
    });
  });

  describe('getCheckout()', () => {
    it('should retrieve an existing session', async () => {
      const created = await client.createCheckout({
        line_items: [{ product_id: 'prod_usb_hub', quantity: 3 }],
      });

      const retrieved = await client.getCheckout(created.id);
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.status).toBe(created.status);
      expect(retrieved.line_items).toHaveLength(1);
    });

    it('should throw for nonexistent session', async () => {
      await expect(
        client.getCheckout('cs_nonexistent')
      ).rejects.toThrow(AcpApiError);
    });
  });

  describe('updateCheckout()', () => {
    it('should add shipping address and transition to ready_for_payment', async () => {
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_webcam', quantity: 1 }],
      });
      expect(session.status).toBe('not_ready_for_payment');

      const updated = await client.updateCheckout(session.id, {
        shipping_address: {
          name: 'Jane Doe',
          line1: '456 Oak Ave',
          city: 'Austin',
          state: 'TX',
          postal_code: '73301',
          country: 'US',
        },
      });

      expect(updated.status).toBe('ready_for_payment');
      expect(updated.shipping_address).toBeDefined();
      expect(updated.shipping_address!.name).toBe('Jane Doe');
      expect(updated.totals.shipping).toBeDefined();
      expect(updated.totals.total.amount).toBeGreaterThan(updated.totals.subtotal.amount);
    });
  });

  describe('completeCheckout()', () => {
    it('should complete a full checkout flow', async () => {
      // Create
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_desk_mat', quantity: 2 }],
      });

      // Add shipping
      await client.updateCheckout(session.id, {
        shipping_address: {
          name: 'Test User',
          line1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94105',
          country: 'US',
        },
      });

      // Complete
      const completed = await client.completeCheckout(session.id, {
        payment_token: 'tok_mock_success',
        payment_handler: 'stripe_shared_payment_token',
      });

      expect(completed.status).toBe('completed');
    });

    it('should reject completion without shipping', async () => {
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_webcam', quantity: 1 }],
      });

      // Try to complete without shipping — status is not_ready_for_payment
      await expect(
        client.completeCheckout(session.id, {
          payment_token: 'tok_mock_success',
          payment_handler: 'stripe_shared_payment_token',
        })
      ).rejects.toThrow(AcpApiError);
    });

    it('should reject failed payment token', async () => {
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_webcam', quantity: 1 }],
      });
      await client.updateCheckout(session.id, {
        shipping_address: {
          name: 'Test',
          line1: '123 St',
          city: 'NYC',
          state: 'NY',
          postal_code: '10001',
          country: 'US',
        },
      });

      await expect(
        client.completeCheckout(session.id, {
          payment_token: 'tok_mock_failure',
          payment_handler: 'stripe_shared_payment_token',
        })
      ).rejects.toThrow(AcpApiError);
    });
  });

  describe('cancelCheckout()', () => {
    it('should cancel an active session', async () => {
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_cable_organizer', quantity: 5 }],
      });

      const canceled = await client.cancelCheckout(session.id);
      expect(canceled.status).toBe('canceled');
    });

    it('should reject canceling a completed session', async () => {
      const session = await client.createCheckout({
        line_items: [{ product_id: 'prod_phone_charger', quantity: 1 }],
      });
      await client.updateCheckout(session.id, {
        shipping_address: {
          name: 'Test',
          line1: '1 St',
          city: 'LA',
          state: 'CA',
          postal_code: '90001',
          country: 'US',
        },
      });
      await client.completeCheckout(session.id, {
        payment_token: 'tok_mock_success',
        payment_handler: 'stripe_shared_payment_token',
      });

      await expect(
        client.cancelCheckout(session.id)
      ).rejects.toThrow(AcpApiError);
    });
  });

  describe('authentication', () => {
    it('should reject invalid API key', async () => {
      const badClient = new AcpClient({
        endpoint: merchant.acpEndpoint,
        apiKey: 'wrong_key',
      });

      await expect(
        badClient.createCheckout({
          line_items: [{ product_id: 'prod_webcam', quantity: 1 }],
        })
      ).rejects.toThrow(AcpApiError);
    });
  });
});
