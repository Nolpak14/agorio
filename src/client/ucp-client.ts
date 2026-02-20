/**
 * UCP Client - Discovery and interaction with UCP-enabled merchants
 *
 * Handles:
 * - Profile discovery from /.well-known/ucp
 * - Capability normalization (array + object formats)
 * - Service enumeration and transport resolution
 * - REST API calls to merchant endpoints
 */

import type {
  UcpClientOptions,
  UcpProfile,
  UcpCapability,
  UcpService,
  DiscoveryResult,
  NormalizedService,
  PaymentHandler,
  TransportPreference,
} from '../types/index.js';
import { McpClient, McpError } from './mcp-client.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const WELL_KNOWN_PATHS = ['/.well-known/ucp', '/.well-known/ucp.json'];

export class UcpClient {
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;
  private readonly preferredTransport: TransportPreference;

  private discovery: DiscoveryResult | null = null;
  private mcpClient: McpClient | null = null;

  constructor(options: UcpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = {
      'Accept': 'application/json',
      'User-Agent': '@ucptools/agent-sdk/0.1.0',
      ...options.headers,
    };
    this.preferredTransport = options.preferredTransport ?? 'auto';
  }

  /**
   * Discover a UCP merchant by domain.
   * Fetches /.well-known/ucp, normalizes the profile, and caches the result.
   */
  async discover(domain: string): Promise<DiscoveryResult> {
    // Preserve explicit protocol, default to https
    let baseUrl: string;
    let cleanDomain: string;

    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      baseUrl = domain.replace(/\/+$/, '');
      cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    } else {
      cleanDomain = domain.replace(/\/+$/, '');
      baseUrl = `https://${cleanDomain}`;
    }

    let profile: UcpProfile | null = null;
    let profileUrl = '';

    // Try each well-known path; for non-explicit protocol also try http fallback
    const baseUrls = baseUrl.startsWith('http://')
      ? [baseUrl]
      : [baseUrl, baseUrl.replace('https://', 'http://')];

    for (const base of baseUrls) {
      for (const path of WELL_KNOWN_PATHS) {
        const url = `${base}${path}`;
        try {
          const response = await this.fetchWithTimeout(url);
          if (response.ok) {
            profile = (await response.json()) as UcpProfile;
            profileUrl = url;
            break;
          }
        } catch {
          // Try next path/protocol
        }
      }
      if (profile) break;
    }

    if (!profile) {
      throw new UcpDiscoveryError(
        `No UCP profile found at ${baseUrl}. Tried: ${WELL_KNOWN_PATHS.join(', ')}`
      );
    }

    if (!profile.ucp) {
      throw new UcpDiscoveryError('Invalid UCP profile: missing "ucp" root object');
    }

    const capabilities = this.normalizeCapabilities(profile);
    const services = this.normalizeServices(profile);
    const paymentHandlers = profile.payment?.handlers ?? [];

    this.discovery = {
      profile,
      profileUrl,
      domain: cleanDomain,
      version: profile.ucp.version ?? 'unknown',
      services,
      capabilities,
      paymentHandlers,
    };

    return this.discovery;
  }

  /**
   * Get the cached discovery result, or throw if not yet discovered.
   */
  getDiscovery(): DiscoveryResult {
    if (!this.discovery) {
      throw new Error('No discovery result. Call discover() first.');
    }
    return this.discovery;
  }

  /**
   * List all capabilities the merchant supports.
   */
  getCapabilities(): UcpCapability[] {
    return this.getDiscovery().capabilities;
  }

  /**
   * Check if merchant supports a specific capability.
   */
  hasCapability(name: string): boolean {
    return this.getDiscovery().capabilities.some(c => c.name === name);
  }

  /**
   * Get a specific capability by name.
   */
  getCapability(name: string): UcpCapability | undefined {
    return this.getDiscovery().capabilities.find(c => c.name === name);
  }

  /**
   * Get all services with their transports.
   */
  getServices(): NormalizedService[] {
    return this.getDiscovery().services;
  }

  /**
   * Get the REST endpoint for a service.
   */
  getRestEndpoint(serviceName?: string): string | undefined {
    const services = this.getDiscovery().services;
    const service = serviceName
      ? services.find(s => s.name === serviceName)
      : services[0];
    return service?.transports.rest?.endpoint;
  }

  /**
   * Get the MCP endpoint for a service.
   */
  getMcpEndpoint(serviceName?: string): string | undefined {
    const services = this.getDiscovery().services;
    const service = serviceName
      ? services.find(s => s.name === serviceName)
      : services[0];
    return service?.transports.mcp?.endpoint;
  }

  /**
   * Get payment handlers.
   */
  getPaymentHandlers(): PaymentHandler[] {
    return this.getDiscovery().paymentHandlers;
  }

  /**
   * Make an API call to the merchant, using the preferred transport.
   *
   * Transport selection:
   * - 'auto' (default): tries MCP if available, falls back to REST
   * - 'rest': REST only
   * - 'mcp': MCP only (throws if unavailable)
   */
  async callApi(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      serviceName?: string;
      transport?: TransportPreference;
    } = {}
  ): Promise<unknown> {
    const transport = options.transport ?? this.preferredTransport;
    const httpMethod = options.method ?? (options.body ? 'POST' : 'GET');

    // Try MCP first if preferred or auto
    if (transport === 'mcp' || transport === 'auto') {
      const mcpEndpoint = this.getMcpEndpoint(options.serviceName);
      if (mcpEndpoint) {
        try {
          return await this.callViaMcp(mcpEndpoint, path, httpMethod, options.body);
        } catch (err) {
          // In auto mode, fall back to REST on MCP failure
          if (transport === 'auto' && this.getRestEndpoint(options.serviceName)) {
            // Fall through to REST
          } else {
            throw err;
          }
        }
      } else if (transport === 'mcp') {
        throw new Error('No MCP endpoint available. Discover the merchant first.');
      }
    }

    // REST transport
    const endpoint = this.getRestEndpoint(options.serviceName);
    if (!endpoint) {
      throw new Error('No REST endpoint available. Discover the merchant first.');
    }

    const url = `${endpoint}${path}`;

    const response = await this.fetchWithTimeout(url, {
      method: httpMethod,
      headers: {
        ...this.headers,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new UcpApiError(
        `API call failed: ${httpMethod} ${path} → ${response.status}`,
        response.status,
        errorBody
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Make a direct JSON-RPC call via MCP transport.
   */
  async callMcp(
    method: string,
    params?: Record<string, unknown>,
    serviceName?: string
  ): Promise<unknown> {
    const mcpEndpoint = this.getMcpEndpoint(serviceName);
    if (!mcpEndpoint) {
      throw new Error('No MCP endpoint available. Discover the merchant first.');
    }

    const client = this.getOrCreateMcpClient(mcpEndpoint);
    return client.call(method, params);
  }

  /**
   * Fetch the OpenAPI schema for a service.
   */
  async fetchSchema(serviceName?: string): Promise<unknown> {
    const services = this.getDiscovery().services;
    const service = serviceName
      ? services.find(s => s.name === serviceName)
      : services[0];

    const schemaUrl = service?.transports.rest?.schema;
    if (!schemaUrl) {
      throw new Error(`No REST schema URL for service: ${serviceName ?? 'default'}`);
    }

    const response = await this.fetchWithTimeout(schemaUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema from ${schemaUrl}: ${response.status}`);
    }
    return response.json();
  }

  // ─── Internal helpers ───

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchFn(url, {
        ...init,
        headers: { ...this.headers, ...init?.headers },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Route a REST-style call through the MCP JSON-RPC transport.
   * Maps REST paths to JSON-RPC method names.
   */
  private async callViaMcp(
    mcpEndpoint: string,
    path: string,
    httpMethod: string,
    body?: unknown
  ): Promise<unknown> {
    const client = this.getOrCreateMcpClient(mcpEndpoint);
    const { method, params } = this.restPathToMcpCall(path, httpMethod, body);
    return client.call(method, params);
  }

  /**
   * Map a REST path + method to a JSON-RPC method name + params.
   */
  private restPathToMcpCall(
    path: string,
    httpMethod: string,
    body?: unknown
  ): { method: string; params: Record<string, unknown> } {
    // Strip leading slash and query string for matching
    const [pathPart, queryString] = path.split('?');
    const cleanPath = pathPart.replace(/^\//, '');
    const queryParams: Record<string, string> = {};
    if (queryString) {
      for (const pair of queryString.split('&')) {
        const [key, value] = pair.split('=');
        queryParams[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
      }
    }

    // products/search?q=X
    if (cleanPath === 'products/search') {
      return { method: 'products/search', params: { ...queryParams } };
    }

    // products/:id
    const productMatch = cleanPath.match(/^products\/(.+)$/);
    if (productMatch && httpMethod === 'GET') {
      return { method: 'products/get', params: { id: productMatch[1] } };
    }

    // products (list)
    if (cleanPath === 'products' && httpMethod === 'GET') {
      return { method: 'products/list', params: { ...queryParams } };
    }

    // checkout/complete
    if (cleanPath === 'checkout/complete' && httpMethod === 'POST') {
      return { method: 'checkout/complete', params: (body ?? {}) as Record<string, unknown> };
    }

    // checkout (create)
    if (cleanPath === 'checkout' && httpMethod === 'POST') {
      return { method: 'checkout/create', params: (body ?? {}) as Record<string, unknown> };
    }

    // orders/:id
    const orderMatch = cleanPath.match(/^orders\/(.+)$/);
    if (orderMatch && httpMethod === 'GET') {
      return { method: 'orders/get', params: { id: orderMatch[1] } };
    }

    // Fallback: use the path as the method name
    return {
      method: cleanPath.replace(/\//g, '/'),
      params: { ...(body as Record<string, unknown> ?? {}), ...queryParams },
    };
  }

  private getOrCreateMcpClient(endpoint: string): McpClient {
    if (!this.mcpClient || this.mcpClient.getEndpoint() !== endpoint) {
      this.mcpClient = new McpClient({
        endpoint,
        timeoutMs: this.timeoutMs,
        fetch: this.fetchFn,
        headers: this.headers,
      });
    }
    return this.mcpClient;
  }

  /**
   * Normalize capabilities from both array and object-keyed formats.
   */
  private normalizeCapabilities(profile: UcpProfile): UcpCapability[] {
    const caps = profile.ucp.capabilities;

    if (Array.isArray(caps)) {
      return caps.map(c => ({
        name: typeof c === 'string' ? c : c.name,
        version: typeof c === 'string' ? profile.ucp.version : c.version,
        spec: typeof c === 'string' ? '' : c.spec,
        schema: typeof c === 'string' ? '' : c.schema,
        extends: typeof c === 'string' ? undefined : c.extends,
        config: typeof c === 'string' ? undefined : c.config,
      }));
    }

    // Object-keyed format: { "dev.ucp.shopping.checkout": [{ version, spec, schema }] }
    const result: UcpCapability[] = [];
    for (const [name, entries] of Object.entries(caps)) {
      for (const entry of entries) {
        result.push({
          name,
          version: entry.version,
          spec: entry.spec ?? '',
          schema: entry.schema ?? '',
          extends: entry.extends,
          config: entry.config,
        });
      }
    }
    return result;
  }

  /**
   * Normalize services from the profile into a flat array.
   */
  private normalizeServices(profile: UcpProfile): NormalizedService[] {
    const result: NormalizedService[] = [];

    for (const [name, serviceOrArray] of Object.entries(profile.ucp.services)) {
      const services = Array.isArray(serviceOrArray) ? serviceOrArray : [serviceOrArray];

      for (const svc of services) {
        result.push({
          name,
          version: svc.version,
          spec: svc.spec,
          transports: {
            rest: svc.rest,
            mcp: svc.mcp,
            a2a: svc.a2a,
          },
        });
      }
    }

    return result;
  }
}

// ─── Error classes ───

export class UcpDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UcpDiscoveryError';
  }
}

export class UcpApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'UcpApiError';
  }
}
