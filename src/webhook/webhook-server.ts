/**
 * Webhook Server for Order Update Notifications
 *
 * Receives webhook callbacks from merchants when order statuses change
 * (e.g., confirmed → shipped → delivered). Supports HMAC signature
 * verification for security.
 *
 * Usage:
 *   const webhooks = new WebhookServer({
 *     secret: 'my-hmac-secret',
 *     onOrderUpdate: (event) => console.log(`Order ${event.orderId}: ${event.newStatus}`),
 *   });
 *   await webhooks.start();
 *   // Register webhooks.callbackUrl with merchants
 *   await webhooks.stop();
 */

import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type {
  WebhookServerOptions,
  WebhookEvent,
  OrderUpdateEvent,
} from '../types/index.js';

export class WebhookServer {
  private server: Server | null = null;
  private port: number;
  private readonly secret: string | null;
  private readonly onOrderUpdate?: (event: OrderUpdateEvent) => void;
  private readonly onEvent?: (event: WebhookEvent) => void;

  /** All received events, newest last */
  private eventLog: WebhookEvent[] = [];

  constructor(options: WebhookServerOptions = {}) {
    this.port = options.port ?? 0;
    this.secret = options.secret ?? null;
    this.onOrderUpdate = options.onOrderUpdate;
    this.onEvent = options.onEvent;
  }

  /**
   * Start the webhook server.
   */
  async start(): Promise<void> {
    const { default: express } = await import('express');
    const app = express();

    // Parse raw body for HMAC verification, then JSON
    app.use(express.json());

    // ─── Webhook Endpoint ───
    app.post('/webhooks', (req, res) => {
      const body = req.body;

      // Verify HMAC signature if secret is configured
      if (this.secret) {
        const signature = req.headers['x-webhook-signature'] as string | undefined;
        if (!signature) {
          res.status(401).json({ error: 'Missing webhook signature' });
          return;
        }

        const expectedSignature = this.computeSignature(JSON.stringify(body));
        if (signature !== expectedSignature) {
          res.status(401).json({ error: 'Invalid webhook signature' });
          return;
        }
      }

      // Validate event structure
      if (!body || !body.type || !body.data) {
        res.status(400).json({ error: 'Invalid webhook payload: missing type or data' });
        return;
      }

      const event = body as WebhookEvent;
      this.eventLog.push(event);

      // Dispatch to callbacks
      this.onEvent?.(event);

      if (
        event.type === 'order.updated' ||
        event.type === 'order.shipped' ||
        event.type === 'order.delivered'
      ) {
        this.onOrderUpdate?.(event.data);
      }

      res.json({ received: true });
    });

    // ─── Health Check ───
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', eventsReceived: this.eventLog.length });
    });

    return new Promise<void>((resolve) => {
      this.server = app.listen(this.port, () => {
        const addr = this.server!.address();
        if (typeof addr === 'object' && addr) {
          this.port = addr.port;
        }
        resolve();
      });
    });
  }

  /**
   * Stop the webhook server.
   */
  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        this.server = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get the callback URL that merchants should send webhooks to.
   */
  get callbackUrl(): string {
    return `http://localhost:${this.port}/webhooks`;
  }

  /**
   * Get the base URL of the webhook server.
   */
  get baseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get all received events.
   */
  getEvents(): WebhookEvent[] {
    return [...this.eventLog];
  }

  /**
   * Get events for a specific order.
   */
  getOrderEvents(orderId: string): WebhookEvent[] {
    return this.eventLog.filter((e) => e.data.orderId === orderId);
  }

  /**
   * Clear the event log.
   */
  clearEvents(): void {
    this.eventLog = [];
  }

  /**
   * Compute HMAC-SHA256 signature for a payload.
   */
  computeSignature(payload: string): string {
    if (!this.secret) {
      throw new Error('Cannot compute signature without a secret');
    }
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  /**
   * Verify an HMAC-SHA256 signature for a payload.
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.secret) return true;
    const expected = this.computeSignature(payload);
    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return result === 0;
  }
}
