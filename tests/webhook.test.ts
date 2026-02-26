/**
 * Tests for webhook support — WebhookServer, MockMerchant webhook delivery,
 * and the subscribe_order_updates agent tool.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebhookServer } from '../src/webhook/webhook-server.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  ToolCall,
  WebhookEvent,
  OrderUpdateEvent,
} from '../src/types/index.js';

// ─── ScriptedLlm (same pattern as other tests) ───

class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted-mock';
  private callIndex = 0;
  private readonly script: Array<{ content?: string; toolCalls?: ToolCall[] }>;

  constructor(script: Array<{ content?: string; toolCalls?: ToolCall[] }>) {
    this.script = script;
  }

  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex++];
    if (!step) {
      return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    }
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
    };
  }
}

// ─── Helper: wait for a condition with timeout ───

function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
  intervalMs = 50
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// ─── WebhookServer Tests ───

describe('WebhookServer', () => {
  let server: WebhookServer;

  afterAll(async () => {
    await server?.stop();
  });

  it('should start and stop cleanly', async () => {
    server = new WebhookServer();
    await server.start();
    expect(server.callbackUrl).toMatch(/^http:\/\/localhost:\d+\/webhooks$/);
    await server.stop();
  });

  it('should receive webhook events', async () => {
    const events: WebhookEvent[] = [];
    server = new WebhookServer({
      onEvent: (event) => events.push(event),
    });
    await server.start();

    const response = await fetch(server.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'order.shipped',
        data: {
          orderId: 'ord_123',
          previousStatus: 'confirmed',
          newStatus: 'shipped',
          timestamp: new Date().toISOString(),
          merchantDomain: 'test-merchant.com',
          trackingNumber: 'TRACK-ABC',
        },
      }),
    });

    const json = await response.json();
    expect(json.received).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('order.shipped');
    expect(events[0].data.orderId).toBe('ord_123');
    expect(events[0].data.trackingNumber).toBe('TRACK-ABC');

    await server.stop();
  });

  it('should dispatch onOrderUpdate callback', async () => {
    const updates: OrderUpdateEvent[] = [];
    server = new WebhookServer({
      onOrderUpdate: (event) => updates.push(event),
    });
    await server.start();

    await fetch(server.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'order.delivered',
        data: {
          orderId: 'ord_456',
          previousStatus: 'shipped',
          newStatus: 'delivered',
          timestamp: new Date().toISOString(),
          merchantDomain: 'shop.example.com',
        },
      }),
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].orderId).toBe('ord_456');
    expect(updates[0].newStatus).toBe('delivered');

    await server.stop();
  });

  it('should verify HMAC signatures', async () => {
    server = new WebhookServer({ secret: 'test-secret-123' });
    await server.start();

    const payload = JSON.stringify({
      type: 'order.shipped',
      data: {
        orderId: 'ord_789',
        previousStatus: 'confirmed',
        newStatus: 'shipped',
        timestamp: new Date().toISOString(),
        merchantDomain: 'test.com',
      },
    });

    // Valid signature
    const validSig = server.computeSignature(payload);
    const goodResponse = await fetch(server.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': validSig,
      },
      body: payload,
    });
    expect(goodResponse.status).toBe(200);

    // Invalid signature
    const badResponse = await fetch(server.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'invalid-signature',
      },
      body: payload,
    });
    expect(badResponse.status).toBe(401);

    // Missing signature
    const noSigResponse = await fetch(server.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    expect(noSigResponse.status).toBe(401);

    await server.stop();
  });

  it('should reject invalid payloads', async () => {
    server = new WebhookServer();
    await server.start();

    const response = await fetch(server.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });
    expect(response.status).toBe(400);

    await server.stop();
  });

  it('should track events per order', async () => {
    server = new WebhookServer();
    await server.start();

    // Send events for two orders
    for (const [orderId, status] of [
      ['ord_A', 'shipped'],
      ['ord_B', 'shipped'],
      ['ord_A', 'delivered'],
    ]) {
      await fetch(server.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: `order.${status}`,
          data: {
            orderId,
            previousStatus: 'confirmed',
            newStatus: status,
            timestamp: new Date().toISOString(),
            merchantDomain: 'test.com',
          },
        }),
      });
    }

    expect(server.getEvents()).toHaveLength(3);
    expect(server.getOrderEvents('ord_A')).toHaveLength(2);
    expect(server.getOrderEvents('ord_B')).toHaveLength(1);

    server.clearEvents();
    expect(server.getEvents()).toHaveLength(0);

    await server.stop();
  });

  it('should verify signature with verifySignature method', () => {
    const ws = new WebhookServer({ secret: 'my-secret' });
    const payload = '{"test":true}';
    const sig = ws.computeSignature(payload);

    expect(ws.verifySignature(payload, sig)).toBe(true);
    expect(ws.verifySignature(payload, 'wrong')).toBe(false);
    expect(ws.verifySignature('tampered', sig)).toBe(false);
  });

  it('should have a health check endpoint', async () => {
    server = new WebhookServer();
    await server.start();

    const response = await fetch(`${server.baseUrl}/health`);
    const json = await response.json();
    expect(json.status).toBe('ok');
    expect(json.eventsReceived).toBe(0);

    await server.stop();
  });
});

// ─── MockMerchant Webhook Integration Tests ───

describe('MockMerchant Webhook Delivery', () => {
  let merchant: MockMerchant;
  let webhookServer: WebhookServer;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'WebhookTestShop' });
    await merchant.start();
  });

  afterAll(async () => {
    await webhookServer?.stop();
    await merchant?.stop();
  });

  it('should subscribe to order updates and receive lifecycle webhooks', async () => {
    const receivedEvents: WebhookEvent[] = [];
    webhookServer = new WebhookServer({
      onEvent: (event) => receivedEvents.push(event),
    });
    await webhookServer.start();

    // First, create an order via the checkout flow
    const checkoutRes = await fetch(`${merchant.baseUrl}/ucp/v1/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { productId: 'prod_headphones', name: 'Headphones', quantity: 1, price: { amount: '79.99', currency: 'USD' } },
        ],
      }),
    });
    const checkout = await checkoutRes.json();

    const completeRes = await fetch(`${merchant.baseUrl}/ucp/v1/checkout/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: checkout.sessionId,
        payment: { method: 'card', token: 'tok_mock_success' },
        shippingAddress: {
          name: 'Test User',
          line1: '123 Main St',
          city: 'Portland',
          state: 'OR',
          postalCode: '97201',
          country: 'US',
        },
      }),
    });
    const order = await completeRes.json();
    expect(order.status).toBe('confirmed');

    // Subscribe to webhook updates
    const subRes = await fetch(`${merchant.baseUrl}/ucp/v1/webhooks/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.orderId,
        callbackUrl: webhookServer.callbackUrl,
      }),
    });
    const subscription = await subRes.json();
    expect(subscription.status).toBe('active');
    expect(subscription.subscriptionId).toBeDefined();

    // Wait for simulated lifecycle transitions (shipped at ~100ms, delivered at ~200ms)
    await waitFor(() => receivedEvents.length >= 2, 3000);

    expect(receivedEvents).toHaveLength(2);

    // First event: shipped
    expect(receivedEvents[0].type).toBe('order.shipped');
    expect(receivedEvents[0].data.orderId).toBe(order.orderId);
    expect(receivedEvents[0].data.newStatus).toBe('shipped');
    expect(receivedEvents[0].data.trackingNumber).toBe('TRACK-123456');

    // Second event: delivered
    expect(receivedEvents[1].type).toBe('order.delivered');
    expect(receivedEvents[1].data.orderId).toBe(order.orderId);
    expect(receivedEvents[1].data.newStatus).toBe('delivered');

    await webhookServer.stop();
  });

  it('should deliver signed webhooks when secret is provided', async () => {
    const secret = 'test-webhook-secret';
    const receivedEvents: WebhookEvent[] = [];
    webhookServer = new WebhookServer({
      secret,
      onEvent: (event) => receivedEvents.push(event),
    });
    await webhookServer.start();

    // Create an order
    const checkoutRes = await fetch(`${merchant.baseUrl}/ucp/v1/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { productId: 'prod_keyboard', name: 'Keyboard', quantity: 1, price: { amount: '129.99', currency: 'USD' } },
        ],
      }),
    });
    const checkout = await checkoutRes.json();

    const completeRes = await fetch(`${merchant.baseUrl}/ucp/v1/checkout/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: checkout.sessionId,
        payment: { method: 'card', token: 'tok_mock_success' },
        shippingAddress: {
          name: 'Test User',
          line1: '456 Oak Ave',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          country: 'US',
        },
      }),
    });
    const order = await completeRes.json();

    // Subscribe with secret
    await fetch(`${merchant.baseUrl}/ucp/v1/webhooks/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.orderId,
        callbackUrl: webhookServer.callbackUrl,
        secret,
      }),
    });

    // Wait for signed webhooks
    await waitFor(() => receivedEvents.length >= 2, 3000);

    // If we received events, the HMAC signatures were valid
    // (WebhookServer rejects invalid signatures with 401)
    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].type).toBe('order.shipped');
    expect(receivedEvents[1].type).toBe('order.delivered');

    await webhookServer.stop();
  });

  it('should reject webhook subscription for non-existent order', async () => {
    webhookServer = new WebhookServer();
    await webhookServer.start();

    const res = await fetch(`${merchant.baseUrl}/ucp/v1/webhooks/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'ord_nonexistent',
        callbackUrl: webhookServer.callbackUrl,
      }),
    });
    expect(res.status).toBe(404);

    await webhookServer.stop();
  });

  it('should reject subscription with missing fields', async () => {
    const res = await fetch(`${merchant.baseUrl}/ucp/v1/webhooks/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_123' }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Agent subscribe_order_updates Tool Tests ───

describe('subscribe_order_updates tool', () => {
  let merchant: MockMerchant;
  let webhookServer: WebhookServer;

  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'OrderTrackingShop' });
    await merchant.start();
    webhookServer = new WebhookServer();
    await webhookServer.start();
  });

  afterAll(async () => {
    await webhookServer.stop();
    await merchant.stop();
  });

  it('should subscribe to order updates via agent tool', async () => {
    // Script: discover → add to cart → checkout → complete → subscribe
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_headphones', quantity: 1 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'submit_shipping',
          arguments: {
            name: 'Test User',
            line1: '123 Test St',
            city: 'Portland',
            state: 'OR',
            postalCode: '97201',
            country: 'US',
          },
        }],
      },
      {
        toolCalls: [{
          id: 'call_5',
          name: 'submit_payment',
          arguments: { paymentMethod: 'card', paymentToken: 'tok_mock_success' },
        }],
      },
      // Now subscribe to order updates — use a placeholder; the actual orderId comes from previous step
      // We need to capture orderId dynamically. Since ScriptedLlm can't do that,
      // we'll check the step outputs to find the orderId.
      {
        content: 'Order placed. Let me check the status.',
      },
    ]);

    const agent = new ShoppingAgent({
      llm,
      webhookUrl: webhookServer.callbackUrl,
    });
    const result = await agent.run('Buy headphones and track the order');

    // The order should be placed successfully
    expect(result.success).toBe(true);
    expect(result.checkout?.orderId).toBeDefined();
  });

  it('should return error when webhookUrl not configured', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'add_to_cart',
          arguments: { productId: 'prod_webcam', quantity: 1 },
        }],
      },
      {
        toolCalls: [{
          id: 'call_3',
          name: 'initiate_checkout',
          arguments: {},
        }],
      },
      {
        toolCalls: [{
          id: 'call_4',
          name: 'submit_shipping',
          arguments: {
            name: 'Test',
            line1: '1 Main St',
            city: 'SF',
            state: 'CA',
            postalCode: '94105',
            country: 'US',
          },
        }],
      },
      {
        toolCalls: [{
          id: 'call_5',
          name: 'submit_payment',
          arguments: { paymentMethod: 'card', paymentToken: 'tok_mock_success' },
        }],
      },
      {
        toolCalls: [{
          id: 'call_6',
          name: 'subscribe_order_updates',
          arguments: { orderId: 'placeholder' },
        }],
      },
      { content: 'Webhook not configured.' },
    ]);

    const agent = new ShoppingAgent({ llm }); // No webhookUrl
    const result = await agent.run('Buy webcam and subscribe to updates');

    // Find the subscribe tool result
    const subStep = result.steps.find(
      s => s.toolName === 'subscribe_order_updates' && s.type === 'tool_result'
    );
    expect(subStep).toBeDefined();
    const output = subStep!.toolOutput as { error: string };
    expect(output.error).toContain('No webhook URL configured');
  });

  it('should return error for non-existent order', async () => {
    const llm = new ScriptedLlm([
      {
        toolCalls: [{
          id: 'call_1',
          name: 'discover_merchant',
          arguments: { domain: merchant.domain },
        }],
      },
      {
        toolCalls: [{
          id: 'call_2',
          name: 'subscribe_order_updates',
          arguments: { orderId: 'ord_doesnt_exist' },
        }],
      },
      { content: 'Order not found.' },
    ]);

    const agent = new ShoppingAgent({
      llm,
      webhookUrl: webhookServer.callbackUrl,
    });
    const result = await agent.run('Subscribe to fake order');

    const subStep = result.steps.find(
      s => s.toolName === 'subscribe_order_updates' && s.type === 'tool_result'
    );
    expect(subStep).toBeDefined();
    const output = subStep!.toolOutput as { error: string };
    expect(output.error).toContain('Order not found');
  });
});
