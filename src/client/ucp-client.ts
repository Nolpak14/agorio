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
} from '../types/index.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const WELL_KNOWN_PATHS = ['/.well-known/ucp', '/.well-known/ucp.json'];

export class UcpClient {
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;

  private discovery: DiscoveryResult | null = null;

  constructor(options: UcpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = {
      'Accept': 'application/json',
      'User-Agent': '@ucptools/agent-sdk/0.1.0',
      ...options.headers,
    };
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
   * Get payment handlers.
   */
  getPaymentHandlers(): PaymentHandler[] {
    return this.getDiscovery().paymentHandlers;
  }

  /**
   * Make a REST API call to the merchant's UCP endpoint.
   */
  async callApi(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      serviceName?: string;
    } = {}
  ): Promise<unknown> {
    const endpoint = this.getRestEndpoint(options.serviceName);
    if (!endpoint) {
      throw new Error('No REST endpoint available. Discover the merchant first.');
    }

    const url = `${endpoint}${path}`;
    const method = options.method ?? (options.body ? 'POST' : 'GET');

    const response = await this.fetchWithTimeout(url, {
      method,
      headers: {
        ...this.headers,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new UcpApiError(
        `API call failed: ${method} ${path} → ${response.status}`,
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
