/**
 * ACP Client - Interaction with ACP-enabled merchants
 *
 * Implements the Agentic Commerce Protocol (OpenAI/Stripe) checkout session
 * lifecycle: create, get, update, complete, cancel.
 *
 * ACP spec: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
 */

import type {
  AcpClientOptions,
  AcpCheckoutSession,
  AcpShippingAddress,
} from '../types/index.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_API_VERSION = '2026-01-30';

export class AcpClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(options: AcpClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Create a new checkout session.
   * POST /checkout_sessions
   */
  async createCheckout(params: {
    line_items: Array<{
      product_id: string;
      quantity: number;
      variant_id?: string;
    }>;
    shipping_address?: AcpShippingAddress;
  }): Promise<AcpCheckoutSession> {
    return this.request('POST', '/checkout_sessions', params);
  }

  /**
   * Get an existing checkout session.
   * GET /checkout_sessions/:id
   */
  async getCheckout(sessionId: string): Promise<AcpCheckoutSession> {
    return this.request('GET', `/checkout_sessions/${sessionId}`);
  }

  /**
   * Update a checkout session (e.g., add shipping address, select payment handler).
   * POST /checkout_sessions/:id
   */
  async updateCheckout(
    sessionId: string,
    params: {
      shipping_address?: AcpShippingAddress;
      payment_handler?: string;
      discount_code?: string;
    }
  ): Promise<AcpCheckoutSession> {
    return this.request('POST', `/checkout_sessions/${sessionId}`, params);
  }

  /**
   * Complete a checkout session with payment.
   * POST /checkout_sessions/:id/complete
   */
  async completeCheckout(
    sessionId: string,
    params: {
      payment_token: string;
      payment_handler: string;
    }
  ): Promise<AcpCheckoutSession> {
    return this.request(
      'POST',
      `/checkout_sessions/${sessionId}/complete`,
      params
    );
  }

  /**
   * Cancel a checkout session.
   * POST /checkout_sessions/:id/cancel
   */
  async cancelCheckout(sessionId: string): Promise<AcpCheckoutSession> {
    return this.request('POST', `/checkout_sessions/${sessionId}/cancel`);
  }

  /**
   * Get the configured endpoint URL.
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  // ─── Internal ───

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'API-Version': this.apiVersion,
          'Request-Id': `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new AcpApiError(
          `ACP API call failed: ${method} ${path} → ${response.status}`,
          response.status,
          errorBody
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Error classes ───

export class AcpApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'AcpApiError';
  }
}
