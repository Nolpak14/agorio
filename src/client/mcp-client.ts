/**
 * MCP Client - JSON-RPC 2.0 transport for MCP-enabled merchants
 *
 * Handles:
 * - JSON-RPC 2.0 request/response over HTTP POST
 * - Auto-incrementing request IDs
 * - Error parsing with MCP-specific error codes
 * - Fire-and-forget notifications
 */

import type { McpClientOptions } from '../types/index.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class McpClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;
  private requestId = 0;

  constructor(options: McpClientOptions) {
    this.endpoint = options.endpoint;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Send a JSON-RPC 2.0 request and return the result.
   */
  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;

    const body = {
      jsonrpc: '2.0' as const,
      method,
      params: params ?? {},
      id,
    };

    const response = await this.fetchWithTimeout(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new McpError(
        -32000,
        `MCP HTTP error: ${response.status} ${response.statusText}`,
        { method, httpStatus: response.status }
      );
    }

    const json = (await response.json()) as JsonRpcResponse;

    if ('error' in json && json.error) {
      throw new McpError(json.error.code, json.error.message, json.error.data);
    }

    return json.result;
  }

  /**
   * Send a JSON-RPC 2.0 notification (no response expected).
   */
  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const body = {
      jsonrpc: '2.0' as const,
      method,
      params: params ?? {},
    };

    await this.fetchWithTimeout(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Get the endpoint URL.
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── JSON-RPC Types ───

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

// ─── Error class ───

export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'McpError';
  }
}
