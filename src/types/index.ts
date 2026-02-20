/**
 * @ucptools/agent-sdk - Type Definitions
 *
 * Core types for building AI shopping agents on UCP.
 */

// ─── UCP Profile Types (subset from @ucptools/validator) ───

export interface RestTransport {
  schema: string;
  endpoint: string;
}

export interface McpTransport {
  schema: string;
  endpoint: string;
}

export interface A2aTransport {
  agentCard: string;
}

export interface UcpService {
  version: string;
  spec: string;
  rest?: RestTransport;
  mcp?: McpTransport;
  a2a?: A2aTransport;
}

export interface UcpCapability {
  name: string;
  version: string;
  spec: string;
  schema: string;
  extends?: string;
  config?: Record<string, unknown>;
}

export interface PaymentHandler {
  id: string;
  name: string;
  version: string;
  spec: string;
  config_schema?: string;
  instrument_schemas?: string[];
  config?: Record<string, unknown>;
}

export interface JwkKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
}

export interface UcpProfile {
  ucp: {
    version: string;
    services: Record<string, UcpService | UcpService[]>;
    capabilities: UcpCapability[] | Record<string, Array<{
      version: string;
      spec?: string;
      schema?: string;
      extends?: string;
      config?: Record<string, unknown>;
    }>>;
  };
  payment?: {
    handlers: PaymentHandler[];
  };
  signing_keys?: JwkKey[];
  [key: string]: unknown;
}

// ─── ACP Types (Agentic Commerce Protocol — OpenAI/Stripe) ───

export interface AcpClientOptions {
  /** ACP merchant endpoint URL */
  endpoint: string;
  /** Bearer token for authentication */
  apiKey: string;
  /** API version (default: 2026-01-30) */
  apiVersion?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
}

export type AcpCheckoutStatus =
  | 'not_ready_for_payment'
  | 'ready_for_payment'
  | 'in_progress'
  | 'authentication_required'
  | 'completed'
  | 'canceled';

export interface AcpMoney {
  /** Amount in minor units (cents). e.g. $29.99 = 2999 */
  amount: number;
  /** ISO 4217 currency code */
  currency: string;
}

export interface AcpLineItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: AcpMoney;
  total_price: AcpMoney;
  image_url?: string;
}

export interface AcpShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface AcpCheckoutSession {
  id: string;
  status: AcpCheckoutStatus;
  line_items: AcpLineItem[];
  totals: {
    subtotal: AcpMoney;
    tax?: AcpMoney;
    shipping?: AcpMoney;
    total: AcpMoney;
  };
  payment_handlers?: Array<{
    type: string;
    handler_spec: Record<string, unknown>;
  }>;
  links?: {
    terms_of_use?: string;
    privacy_policy?: string;
    return_policy?: string;
  };
  shipping_address?: AcpShippingAddress;
}

export interface MockAcpMerchantOptions {
  /** Port to listen on (default: 0 for random) */
  port?: number;
  /** Merchant name */
  name?: string;
  /** Product catalog */
  products?: MockProduct[];
  /** Required API key for authentication */
  apiKey?: string;
}

// ─── Transport Types ───

export type TransportPreference = 'auto' | 'rest' | 'mcp';

export interface McpClientOptions {
  /** MCP JSON-RPC endpoint URL */
  endpoint: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

export interface MockMcpMerchantOptions {
  /** Port to listen on (default: 0 for random) */
  port?: number;
  /** Merchant name */
  name?: string;
  /** Product catalog */
  products?: MockProduct[];
}

// ─── SDK Client Types ───

export interface UcpClientOptions {
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  /** Transport preference: 'auto' tries MCP then REST, 'rest' or 'mcp' forces one (default: 'auto') */
  preferredTransport?: TransportPreference;
}

export interface DiscoveryResult {
  profile: UcpProfile;
  profileUrl: string;
  domain: string;
  version: string;
  services: NormalizedService[];
  capabilities: UcpCapability[];
  paymentHandlers: PaymentHandler[];
}

export interface NormalizedService {
  name: string;
  version: string;
  spec: string;
  transports: {
    rest?: RestTransport;
    mcp?: McpTransport;
    a2a?: A2aTransport;
  };
}

// ─── LLM Adapter Types ───

export interface LlmAdapter {
  /** Send a message and get a response, optionally with tool definitions */
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse>;
  /** Stream a response, yielding chunks as they arrive */
  chatStream?(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncIterable<LlmStreamChunk>;
  /** Get the model name */
  readonly modelName: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type LlmStreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_call_delta'; toolCallId: string; argsDelta: string }
  | { type: 'tool_call_complete'; toolCall: ToolCall }
  | { type: 'done'; response: LlmResponse };

// ─── Observability Types ───

export interface AgentLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentSpan {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  end(): void;
}

export interface AgentTracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): AgentSpan;
}

export interface AgentUsageSummary {
  /** Total tokens consumed across all LLM calls */
  totalTokens: number;
  /** Total prompt tokens */
  promptTokens: number;
  /** Total completion tokens */
  completionTokens: number;
  /** Number of LLM chat() calls */
  llmCalls: number;
  /** Number of tool executions */
  toolCalls: number;
  /** Latency per tool call in ms, keyed by tool name */
  toolCallLatency: Record<string, number[]>;
  /** Total wall-clock time for the agent run in ms */
  totalLatencyMs: number;
}

// ─── Plugin Types ───

export interface AgentPlugin {
  /** Tool name the LLM will call (must not collide with built-in tools) */
  name: string;
  /** Description shown to the LLM for function calling */
  description: string;
  /** JSON Schema for the tool parameters */
  parameters: Record<string, unknown>;
  /** Async handler that executes when the LLM calls this tool */
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

// ─── Agent Types ───

export interface AgentOptions {
  /** LLM adapter to use for reasoning */
  llm: LlmAdapter;
  /** UCP client options */
  clientOptions?: UcpClientOptions;
  /** ACP client options (enables ACP protocol support) */
  acpOptions?: AcpClientOptions;
  /** Custom plugins — additional tools beyond the built-in 12 */
  plugins?: AgentPlugin[];
  /** Maximum agent loop iterations (default: 20) */
  maxIterations?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Callback for each agent step */
  onStep?: (step: AgentStep) => void;
  /** Structured log callback for observability */
  onLog?: (event: AgentLogEvent) => void;
  /** OpenTelemetry-compatible tracer (opt-in, no hard dependency) */
  tracer?: AgentTracer;
}

export interface AgentStep {
  iteration: number;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'final_answer';
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  content?: string;
  timestamp: number;
}

export interface AgentResult {
  success: boolean;
  answer: string;
  steps: AgentStep[];
  iterations: number;
  merchant?: {
    domain: string;
    profile: UcpProfile;
  };
  checkout?: CheckoutResult;
  usage?: AgentUsageSummary;
  error?: string;
}

export interface AgentStreamEvent {
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'done' | 'error';
  iteration: number;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  result?: AgentResult;
  error?: string;
  timestamp: number;
}

export interface CheckoutResult {
  orderId: string;
  status: 'completed' | 'pending' | 'failed';
  items: CartItem[];
  total: MoneyAmount;
  paymentMethod?: string;
  fulfillment?: {
    method: string;
    estimatedDelivery?: string;
  };
}

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: MoneyAmount;
}

export interface MoneyAmount {
  amount: string;
  currency: string;
}

// ─── Mock Server Types ───

export interface MockMerchantOptions {
  /** Port to listen on (default: 0 for random) */
  port?: number;
  /** Merchant name */
  name?: string;
  /** Product catalog */
  products?: MockProduct[];
  /** Simulate latency in ms */
  latencyMs?: number;
  /** Simulate error rate (0-1) */
  errorRate?: number;
}

export interface MockProduct {
  id: string;
  name: string;
  description: string;
  price: MoneyAmount;
  category?: string;
  inStock?: boolean;
  imageUrl?: string;
  variants?: Array<{
    id: string;
    name: string;
    price?: MoneyAmount;
  }>;
}

export interface MockOrder {
  id: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
  items: CartItem[];
  subtotal: MoneyAmount;
  total: MoneyAmount;
  shippingAddress?: ShippingAddress;
  createdAt: string;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// ─── Tool Result Types (for agent tool execution) ───

export interface ProductSearchResult {
  products: MockProduct[];
  total: number;
  query?: string;
}

export interface CartState {
  items: CartItem[];
  subtotal: MoneyAmount;
  itemCount: number;
}

export type AgentToolName =
  | 'discover_merchant'
  | 'list_capabilities'
  | 'browse_products'
  | 'get_product'
  | 'search_products'
  | 'add_to_cart'
  | 'view_cart'
  | 'remove_from_cart'
  | 'initiate_checkout'
  | 'submit_shipping'
  | 'submit_payment'
  | 'get_order_status';
