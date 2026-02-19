/**
 * Mock UCP Merchant Server
 *
 * A fully functional UCP-compliant mock merchant for testing shopping agents.
 * Serves a UCP profile at /.well-known/ucp and provides REST API endpoints
 * for browsing products, managing cart, and completing checkout.
 *
 * Usage:
 *   const merchant = new MockMerchant({ port: 3456 });
 *   await merchant.start();
 *   // ... run agent tests against merchant.baseUrl ...
 *   await merchant.stop();
 */

import type { Server } from 'node:http';
import type {
  MockMerchantOptions,
  MockProduct,
  MockOrder,
  CartItem,
} from '../types/index.js';
import {
  DEFAULT_PRODUCTS,
  buildMockProfile,
  buildMockOpenApiSchema,
} from './fixtures.js';

export class MockMerchant {
  private server: Server | null = null;
  private port: number;
  private readonly name: string;
  private readonly products: MockProduct[];
  private readonly latencyMs: number;
  private readonly errorRate: number;

  // Server-side state
  private orders: Map<string, MockOrder> = new Map();
  private checkoutSessions: Map<string, { items: CartItem[]; createdAt: string }> =
    new Map();

  constructor(options: MockMerchantOptions = {}) {
    this.port = options.port ?? 0;
    this.name = options.name ?? 'Mock Merchant';
    this.products = options.products ?? DEFAULT_PRODUCTS;
    this.latencyMs = options.latencyMs ?? 0;
    this.errorRate = options.errorRate ?? 0;
  }

  /**
   * Start the mock merchant server.
   */
  async start(): Promise<void> {
    // Dynamic import of express to keep it as optional peer dep
    const { default: express } = await import('express');
    const app = express();
    app.use(express.json());

    // Simulate latency
    if (this.latencyMs > 0) {
      app.use((_req, _res, next) => {
        setTimeout(next, this.latencyMs);
      });
    }

    // Simulate errors
    if (this.errorRate > 0) {
      app.use((_req, res, next) => {
        if (Math.random() < this.errorRate) {
          res.status(500).json({ error: 'Simulated server error' });
          return;
        }
        next();
      });
    }

    // ─── UCP Discovery ───
    app.get('/.well-known/ucp', (_req, res) => {
      res.json(buildMockProfile(this.baseUrl, this.name));
    });

    app.get('/.well-known/ucp.json', (_req, res) => {
      res.json(buildMockProfile(this.baseUrl, this.name));
    });

    // ─── OpenAPI Schema ───
    app.get('/ucp/schema/openapi.json', (_req, res) => {
      res.json(buildMockOpenApiSchema(this.baseUrl));
    });

    // ─── Product API ───
    app.get('/ucp/v1/products', (req, res) => {
      let filtered = [...this.products];
      const category = req.query.category as string | undefined;
      if (category) {
        filtered = filtered.filter(
          p => p.category?.toLowerCase() === category.toLowerCase()
        );
      }
      res.json({ products: filtered, total: filtered.length });
    });

    app.get('/ucp/v1/products/search', (req, res) => {
      const q = ((req.query.q as string) ?? '').toLowerCase();
      const filtered = this.products.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.category?.toLowerCase().includes(q) ?? false)
      );
      res.json({ products: filtered, total: filtered.length, query: q });
    });

    app.get('/ucp/v1/products/:id', (req, res) => {
      const product = this.products.find(p => p.id === req.params.id);
      if (!product) {
        res.status(404).json({ error: `Product not found: ${req.params.id}` });
        return;
      }
      res.json(product);
    });

    // ─── Checkout API ───
    app.post('/ucp/v1/checkout', (req, res) => {
      const items = (req.body.items ?? []) as CartItem[];
      if (items.length === 0) {
        res.status(400).json({ error: 'Cart is empty' });
        return;
      }

      // Enrich items with product data
      const enrichedItems = items.map(item => {
        const product = this.products.find(p => p.id === item.productId);
        return {
          ...item,
          name: product?.name ?? item.name,
          price: product?.price ?? item.price,
        };
      });

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.checkoutSessions.set(sessionId, {
        items: enrichedItems,
        createdAt: new Date().toISOString(),
      });

      const subtotal = enrichedItems.reduce(
        (sum, item) => sum + parseFloat(item.price.amount) * item.quantity,
        0
      );

      res.json({
        sessionId,
        items: enrichedItems,
        subtotal: { amount: subtotal.toFixed(2), currency: 'USD' },
        shipping: {
          options: [
            { id: 'standard', name: 'Standard Shipping', price: { amount: '5.99', currency: 'USD' }, estimatedDays: '5-7' },
            { id: 'express', name: 'Express Shipping', price: { amount: '12.99', currency: 'USD' }, estimatedDays: '2-3' },
          ],
        },
      });
    });

    app.post('/ucp/v1/checkout/complete', (req, res) => {
      const { sessionId, payment, shippingAddress } = req.body;

      const session = sessionId ? this.checkoutSessions.get(sessionId) : null;
      const items = session?.items ?? (req.body.items as CartItem[]) ?? [];

      if (items.length === 0) {
        res.status(400).json({ error: 'No items in checkout session' });
        return;
      }

      // Simulate payment validation
      if (payment?.token === 'tok_mock_failure') {
        res.status(402).json({ error: 'Payment declined' });
        return;
      }

      const subtotal = items.reduce(
        (sum: number, item: CartItem) =>
          sum + parseFloat(item.price.amount) * item.quantity,
        0
      );

      const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const order: MockOrder = {
        id: orderId,
        status: 'confirmed',
        items,
        subtotal: { amount: subtotal.toFixed(2), currency: 'USD' },
        total: { amount: (subtotal + 5.99).toFixed(2), currency: 'USD' }, // + standard shipping
        shippingAddress,
        createdAt: new Date().toISOString(),
      };

      this.orders.set(orderId, order);

      // Clean up session
      if (sessionId) {
        this.checkoutSessions.delete(sessionId);
      }

      res.json({
        orderId,
        status: 'confirmed',
        order,
      });
    });

    // ─── Order API ───
    app.get('/ucp/v1/orders/:id', (req, res) => {
      const order = this.orders.get(req.params.id);
      if (!order) {
        res.status(404).json({ error: `Order not found: ${req.params.id}` });
        return;
      }
      res.json({ order });
    });

    // ─── Health Check ───
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', merchant: this.name });
    });

    // Start listening
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
   * Stop the mock merchant server.
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
   * Get the base URL of the running server.
   */
  get baseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get the domain (host:port) for UCP discovery.
   */
  get domain(): string {
    return `localhost:${this.port}`;
  }

  /**
   * Get all orders placed.
   */
  getOrders(): MockOrder[] {
    return [...this.orders.values()];
  }

  /**
   * Reset server state (orders, checkout sessions).
   */
  reset(): void {
    this.orders.clear();
    this.checkoutSessions.clear();
  }
}
