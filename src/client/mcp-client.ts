/**
 * MCP Client - JSON-RPC 2.0 transport for MCP-enabled servers
 *
 * Two layers of API:
 *
 *  1. Generic JSON-RPC: `call(method, params)` / `notify(method, params)`.
 *     Works against any JSON-RPC 2.0 endpoint. Used by UCP's MCP-transport
 *     mapping and by the agorio commerce mock merchants.
 *
 *  2. MCP-spec methods (v0.9): `initialize()`, `listTools()`, `callTool(...)`,
 *     `listResources()`, `readResource(...)`, `listPrompts()`, `getPrompt(...)`.
 *     Lets the SDK talk to any standard MCP server (filesystem, GitHub, custom
 *     internal servers) without going through UCP discovery.
 */

import type { McpClientOptions } from '../types/index.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/** MCP protocol version this client speaks. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

// ─── MCP-spec types ───

export interface McpClientInfo {
  name:    string;
  version: string;
}

export interface McpServerInfo {
  name:    string;
  version: string;
}

export interface McpServerCapabilities {
  tools?:     { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?:   { listChanged?: boolean };
  logging?:   Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo:      McpServerInfo;
  capabilities:    McpServerCapabilities;
  instructions?:   string;
}

export interface McpToolDescriptor {
  name:         string;
  description?: string;
  inputSchema:  Record<string, unknown>;
}

export interface McpToolListResult {
  tools:       McpToolDescriptor[];
  nextCursor?: string;
}

export type McpContentBlock =
  | { type: 'text';     text: string }
  | { type: 'image';    data: string; mimeType: string }
  | { type: 'audio';    data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

export interface McpToolCallResult {
  content: McpContentBlock[];
  isError?: boolean;
}

export interface McpResource {
  uri:          string;
  name?:        string;
  description?: string;
  mimeType?:    string;
}

export interface McpResourceListResult {
  resources:   McpResource[];
  nextCursor?: string;
}

export interface McpResourceReadResult {
  contents: Array<{
    uri:       string;
    mimeType?: string;
    text?:     string;
    blob?:     string;
  }>;
}

export interface McpPromptArgument {
  name:         string;
  description?: string;
  required?:    boolean;
}

export interface McpPrompt {
  name:         string;
  description?: string;
  arguments?:   McpPromptArgument[];
}

export interface McpPromptListResult {
  prompts:     McpPrompt[];
  nextCursor?: string;
}

export interface McpPromptMessage {
  role:    'user' | 'assistant';
  content: McpContentBlock;
}

export interface McpPromptGetResult {
  description?: string;
  messages:     McpPromptMessage[];
}

// ─── Client ───

export class McpClient {
  private readonly endpoint:  string;
  private readonly timeoutMs: number;
  private readonly fetchFn:   typeof globalThis.fetch;
  private readonly headers:   Record<string, string>;
  private requestId = 0;

  constructor(options: McpClientOptions) {
    this.endpoint  = options.endpoint;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn   = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers   = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
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

  // ─── MCP spec methods (v0.9) ───

  /**
   * Perform the MCP lifecycle handshake. Servers reply with their
   * `protocolVersion`, `serverInfo`, and `capabilities`. Call once per session.
   * Per spec, follow with `notifyInitialized()`.
   */
  async initialize(opts?: {
    clientInfo?:      McpClientInfo;
    protocolVersion?: string;
    capabilities?:    Record<string, unknown>;
  }): Promise<McpInitializeResult> {
    const result = await this.call('initialize', {
      protocolVersion: opts?.protocolVersion ?? MCP_PROTOCOL_VERSION,
      clientInfo:      opts?.clientInfo      ?? { name: '@agorio/sdk', version: '0.9.0' },
      capabilities:    opts?.capabilities    ?? {},
    });
    return result as McpInitializeResult;
  }

  /** Notify the server that initialization is complete. */
  async notifyInitialized(): Promise<void> {
    return this.notify('notifications/initialized');
  }

  /** List the tools the server exposes. Supports cursor pagination. */
  async listTools(cursor?: string): Promise<McpToolListResult> {
    const params: Record<string, unknown> = {};
    if (cursor) params.cursor = cursor;
    return (await this.call('tools/list', params)) as McpToolListResult;
  }

  /** Invoke a tool by name with arbitrary JSON arguments. */
  async callTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
    return (await this.call('tools/call', { name, arguments: args ?? {} })) as McpToolCallResult;
  }

  /** List resources the server exposes. */
  async listResources(cursor?: string): Promise<McpResourceListResult> {
    const params: Record<string, unknown> = {};
    if (cursor) params.cursor = cursor;
    return (await this.call('resources/list', params)) as McpResourceListResult;
  }

  /** Read a resource by URI. */
  async readResource(uri: string): Promise<McpResourceReadResult> {
    return (await this.call('resources/read', { uri })) as McpResourceReadResult;
  }

  /** List prompts the server exposes. */
  async listPrompts(cursor?: string): Promise<McpPromptListResult> {
    const params: Record<string, unknown> = {};
    if (cursor) params.cursor = cursor;
    return (await this.call('prompts/list', params)) as McpPromptListResult;
  }

  /** Materialize a prompt with the given arguments. */
  async getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptGetResult> {
    const params: Record<string, unknown> = { name };
    if (args) params.arguments = args;
    return (await this.call('prompts/get', params)) as McpPromptGetResult;
  }

  /** Get the endpoint URL. */
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
  code:    number;
  message: string;
  data?:   unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id:      number;
  result?: unknown;
  error?:  JsonRpcError;
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
