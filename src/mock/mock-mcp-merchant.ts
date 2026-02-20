/**
 * Mock MCP Merchant Server
 *
 * A mock merchant that exposes ONLY MCP transport (no REST).
 * Serves a UCP profile at /.well-known/ucp with MCP transport binding,
 * and a JSON-RPC 2.0 endpoint at /mcp for shopping operations.
 *
 * JSON-RPC methods:
 *   products/list     - List all products (params: { category? })
 *   products/search   - Search products (params: { q, limit? })
 *   products/get      - Get product by ID (params: { id })
 *   checkout/create   - Initiate checkout (params: { items })
 *   checkout/complete - Complete checkout (params: { sessionId, payment, shippingAddress })
 *   orders/get        - Get order status (params: { id })
 */

import type { Server } from 'node:http';
import type {
  MockMcpMerchantOptions,
  MockProduct,
  MockOrder,
  CartItem,
  UcpProfile,
} from '../types/index.js';
import { DEFAULT_PRODUCTS } from './fixtures.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: number | string;
}

export class MockMcpMerchant {
  private server: Server | null = null;
  private port: number;
  private readonly name: string;
  private readonly products: MockProduct[];

  private orders: Map<string, MockOrder> = new Map();
  private checkoutSessions: Map<string, { items: CartItem[]; createdAt: string }> =
    new Map();

  constructor(options: MockMcpMerchantOptions = {}) {
    this.port = options.port ?? 0;
    this.name = options.name ?? 'Mock MCP Merchant';
    this.products = options.products ?? DEFAULT_PRODUCTS;
  }

  async start(): Promise<void> {
    const { default: express } = await import('express');
    const app = express();
    app.use(express.json());

    // ─── UCP Discovery (MCP-only profile) ───
    app.get('/.well-known/ucp', (_req, res) => {
      res.json(this.buildMcpProfile());
    });

    app.get('/.well-known/ucp.json', (_req, res) => {
      res.json(this.buildMcpProfile());
    });

    // ─── JSON-RPC Endpoint ───
    app.post('/mcp', (req, res) => {
      const rpcReq = req.body as JsonRpcRequest;

      if (rpcReq.jsonrpc !== '2.0' || !rpcReq.method) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: rpcReq.id ?? null,
          error: { code: -32600, message: 'Invalid Request' },
        });
        return;
      }

      const params = rpcReq.params ?? {};

      try {
        const result = this.handleMethod(rpcReq.method, params);

        // Notification (no id) — no response body
        if (rpcReq.id === undefined || rpcReq.id === null) {
          res.status(204).end();
          return;
        }

        res.json({ jsonrpc: '2.0', id: rpcReq.id, result });
      } catch (err) {
        const mcpErr = err as { code?: number; message?: string; data?: unknown };
        res.json({
          jsonrpc: '2.0',
          id: rpcReq.id ?? null,
          error: {
            code: mcpErr.code ?? -32603,
            message: mcpErr.message ?? 'Internal error',
            data: mcpErr.data,
          },
        });
      }
    });

    // ─── Health Check ───
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', merchant: this.name, transport: 'mcp' });
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

  get baseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  get domain(): string {
    return `localhost:${this.port}`;
  }

  getOrders(): MockOrder[] {
    return [...this.orders.values()];
  }

  reset(): void {
    this.orders.clear();
    this.checkoutSessions.clear();
  }

  // ─── JSON-RPC Method Dispatch ───

  private handleMethod(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'products/list':
        return this.rpcProductsList(params);
      case 'products/search':
        return this.rpcProductsSearch(params);
      case 'products/get':
        return this.rpcProductsGet(params);
      case 'checkout/create':
        return this.rpcCheckoutCreate(params);
      case 'checkout/complete':
        return this.rpcCheckoutComplete(params);
      case 'orders/get':
        return this.rpcOrdersGet(params);
      default:
        throw { code: -32601, message: `Method not found: ${method}` };
    }
  }

  private rpcProductsList(params: Record<string, unknown>) {
    let filtered = [...this.products];
    const category = params.category as string | undefined;
    if (category) {
      filtered = filtered.filter(
        p => p.category?.toLowerCase() === category.toLowerCase()
      );
    }
    return { products: filtered, total: filtered.length };
  }

  private rpcProductsSearch(params: Record<string, unknown>) {
    const q = ((params.q as string) ?? '').toLowerCase();
    const limit = (params.limit as number) ?? 50;
    const filtered = this.products.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false)
    );
    return {
      products: filtered.slice(0, limit),
      total: filtered.length,
      query: q,
    };
  }

  private rpcProductsGet(params: Record<string, unknown>) {
    const id = params.id as string;
    const product = this.products.find(p => p.id === id);
    if (!product) {
      throw { code: -32602, message: `Product not found: ${id}`, data: { id } };
    }
    return product;
  }

  private rpcCheckoutCreate(params: Record<string, unknown>) {
    const items = (params.items ?? []) as CartItem[];
    if (items.length === 0) {
      throw { code: -32602, message: 'Cart is empty' };
    }

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

    return {
      sessionId,
      items: enrichedItems,
      subtotal: { amount: subtotal.toFixed(2), currency: 'USD' },
      shipping: {
        options: [
          { id: 'standard', name: 'Standard Shipping', price: { amount: '5.99', currency: 'USD' }, estimatedDays: '5-7' },
          { id: 'express', name: 'Express Shipping', price: { amount: '12.99', currency: 'USD' }, estimatedDays: '2-3' },
        ],
      },
    };
  }

  private rpcCheckoutComplete(params: Record<string, unknown>) {
    const { sessionId, payment, shippingAddress } = params as {
      sessionId?: string;
      payment?: { method: string; token: string };
      shippingAddress?: Record<string, string>;
    };

    const session = sessionId ? this.checkoutSessions.get(sessionId) : null;
    const items = session?.items ?? (params.items as CartItem[]) ?? [];

    if (items.length === 0) {
      throw { code: -32602, message: 'No items in checkout session' };
    }

    if (payment?.token === 'tok_mock_failure') {
      throw { code: -32000, message: 'Payment declined' };
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
      total: { amount: (subtotal + 5.99).toFixed(2), currency: 'USD' },
      shippingAddress: shippingAddress as unknown as MockOrder['shippingAddress'],
      createdAt: new Date().toISOString(),
    };

    this.orders.set(orderId, order);
    if (sessionId) this.checkoutSessions.delete(sessionId);

    return { orderId, status: 'confirmed', order };
  }

  private rpcOrdersGet(params: Record<string, unknown>) {
    const id = params.id as string;
    const order = this.orders.get(id);
    if (!order) {
      throw { code: -32602, message: `Order not found: ${id}`, data: { id } };
    }
    return { order };
  }

  // ─── Profile Builder ───

  private buildMcpProfile(): UcpProfile {
    return {
      ucp: {
        version: '2026-01-11',
        services: {
          'dev.ucp.shopping': {
            version: '2026-01-11',
            spec: 'https://ucp.dev/specification/overview/',
            mcp: {
              schema: `${this.baseUrl}/mcp/schema.json`,
              endpoint: `${this.baseUrl}/mcp`,
            },
          },
        },
        capabilities: [
          {
            name: 'dev.ucp.shopping.checkout',
            version: '2026-01-11',
            spec: 'https://ucp.dev/specification/checkout/',
            schema: 'https://ucp.dev/schemas/shopping/checkout.json',
          },
          {
            name: 'dev.ucp.shopping.order',
            version: '2026-01-11',
            spec: 'https://ucp.dev/specification/order/',
            schema: 'https://ucp.dev/schemas/shopping/order.json',
          },
        ],
      },
      payment: {
        handlers: [
          {
            id: 'mock_payment',
            name: `${this.name} Mock Payment`,
            version: '2026-01-11',
            spec: 'https://ucp.dev/handlers/tokenization/mock/',
            config: { test_mode: true },
          },
        ],
      },
    };
  }
}
