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

// ─── Enterprise Plugin Types ───

export interface PluginManifest {
  version: string;
  author: string;
  category: 'governance' | 'analytics' | 'integration' | 'utility' | string;
  tier: 'free' | 'pro' | 'enterprise';
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
  peerSdkVersion?: string;
}

export interface PluginContext {
  getCart(): CartState;
  getActiveMerchant(): string | null;
  getCheckoutSessionId(): string | null;
  getMerchants(): string[];
  getSteps(): AgentStep[];
  getCurrentIteration(): number;
}

export interface PluginToolDecision {
  allow: boolean;
  reason?: string;
  modifiedArgs?: Record<string, unknown>;
}

export interface EnterprisePlugin extends AgentPlugin {
  manifest?: PluginManifest;
  onRegister?(context: PluginContext): void;
  onInit?(context: PluginContext): Promise<void> | void;
  onBeforeToolCall?(
    toolName: string,
    args: Record<string, unknown>,
    context: PluginContext
  ): Promise<PluginToolDecision> | PluginToolDecision;
  onAfterToolCall?(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    context: PluginContext
  ): Promise<void> | void;
  configure?(config: Record<string, unknown>): void;
  getState?(): Record<string, unknown>;
  /** Optional — rehydrate from a snapshot previously returned by getState(). */
  hydrate?(state: Record<string, unknown>): void;
}

export function isEnterprisePlugin(plugin: AgentPlugin): plugin is EnterprisePlugin {
  return 'onBeforeToolCall' in plugin
    || 'onAfterToolCall' in plugin
    || 'onRegister' in plugin
    || 'onInit' in plugin
    || 'manifest' in plugin
    || 'configure' in plugin
    || 'getState' in plugin;
}

// ─── Persistent Sessions ───

/**
 * Serializable snapshot of a ShoppingAgent's mid-run state. Persist via a
 * SessionStorage implementation; rehydrate by passing `sessionId` to a
 * ShoppingAgent constructed with the same `sessionStorage`. Adapter and LLM
 * instances are NOT serialized — they must be re-supplied at construction.
 */
export interface SessionState {
  sessionId: string;
  task: string;
  iteration: number;
  /** Full conversation history needed to continue the LLM loop. */
  messages: ChatMessage[];
  /** Persisted per-merchant state (cart, checkout session, shipping). */
  merchants: Array<{
    domain: string;
    protocol: 'ucp' | 'acp' | 'adapter';
    cart: CartItem[];
    checkoutSessionId: string | null;
    shippingAddress: ShippingAddress | null;
  }>;
  activeMerchantDomain: string | null;
  /** Plugin state keyed by plugin name (`getState()` / `hydrate()` round-trip). */
  pluginState?: Record<string, Record<string, unknown>>;
  /** Optional customer/owner id for tenant-scoped storages. */
  customerId?: string;
  savedAt: string;
  /** Agorio SDK version that wrote this snapshot. */
  sdkVersion?: string;
}

export interface SessionStorage {
  save(state: SessionState): Promise<void>;
  load(sessionId: string): Promise<SessionState | null>;
  list(filter?: { customerId?: string; before?: Date }): Promise<SessionState[]>;
  delete(sessionId: string): Promise<void>;
}

// ─── Agent Composition (Sub-Agent + AgentChain) ───

/**
 * A child agent that can be invoked from a parent ShoppingAgent via the
 * built-in `invoke_sub_agent` tool, or composed sequentially via AgentChain.
 *
 * Provide `build` (a factory) so each invocation gets a fresh agent with
 * the parent's tracer and onLog wrapped to inject `parent_span_id` and
 * `sub_agent_name` attributes — the Cloud trace explorer uses these to
 * render the multi-agent run as a tree.
 */
export interface SubAgent {
  /** Stable identifier used as the tool-call argument and span attribute. */
  name: string;
  /** Description shown to the parent LLM when it invokes the sub-agent. */
  description: string;
  /**
   * Factory invoked once per sub-agent run. Receives a build context with
   * a pre-wrapped tracer / onLog that tag child spans and logs with parent
   * metadata. Use these directly when constructing the child ShoppingAgent.
   */
  build: (ctx: SubAgentBuildContext) => unknown;
  /** Optional JSON Schema validated against the parent's `input` argument. */
  inputSchema?: Record<string, unknown>;
}

export interface SubAgentBuildContext {
  /** Wrapped tracer; child spans inherit `parent_span_id` + `sub_agent_name`. */
  tracer?: AgentTracer;
  /** Wrapped onLog; child log events inherit `sub_agent_name` in `data`. */
  onLog?: (event: AgentLogEvent) => void;
  /** Current depth in the sub-agent tree. 1 for direct children of the root. */
  depth: number;
}

export interface ChainResultEntry {
  subAgentName: string;
  output: AgentResult;
}

export interface ChainContext {
  /** Results of each step that has run so far, in order. */
  results: ChainResultEntry[];
  /** Free-form key/value scratch space for cross-step data. */
  shared: Record<string, unknown>;
}

export interface AgentChainStep {
  subAgent: SubAgent;
  /**
   * Derive the input for this step from prior step results. If omitted,
   * the prior step's `answer` is used directly.
   */
  inputFrom?: (ctx: ChainContext, initialInput: string) => string;
}

// ─── Agent Types ───

export interface AgentOptions {
  /** LLM adapter to use for reasoning */
  llm: LlmAdapter;
  /** UCP client options */
  clientOptions?: UcpClientOptions;
  /** ACP client options (enables ACP protocol support) */
  acpOptions?: AcpClientOptions;
  /** Merchant adapters for real e-commerce platform connectivity */
  adapters?: MerchantAdapter[];
  /** Webhook callback URL for order update notifications */
  webhookUrl?: string;
  /** HMAC secret for webhook signature verification */
  webhookSecret?: string;
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
  /** Called once after the agent finishes (success, max-iter, or error). Used by `agorioCloud()` to flush traces. */
  onComplete?: (result: AgentResult) => void | Promise<void>;
  /** Per-plugin configuration, keyed by plugin name */
  pluginConfigs?: Record<string, Record<string, unknown>>;
  /**
   * Enable AP2 (Agent Payments Protocol) mandate-based payment flow.
   * Promoted to GA in v0.8 — kept as an opt-in because AP2 requires a signer
   * and a payment endpoint that the SDK cannot infer from merchant discovery.
   */
  ap2?: boolean;
  /** Persistent session storage — enables resume across process restarts. */
  sessionStorage?: SessionStorage;
  /** Session ID — if a snapshot exists for this ID, the agent resumes from it. */
  sessionId?: string;
  /** Owner / tenant id to attach to saved sessions. */
  sessionCustomerId?: string;
  /** Sub-agents the LLM can invoke via the built-in `invoke_sub_agent` tool. */
  subAgents?: SubAgent[];
  /** Maximum nested sub-agent depth. Default: 3. */
  subAgentMaxDepth?: number;
  /** Internal — current depth in a parent→child chain. Do not set manually. */
  _subAgentDepth?: number;
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
  | 'get_order_status'
  | 'switch_merchant'
  | 'get_product_reviews'
  | 'apply_discount_code'
  | 'compare_prices'
  | 'subscribe_order_updates';

// ─── Merchant Adapter Types ───

/**
 * Discovery result from a merchant adapter.
 */
export interface MerchantAdapterDiscovery {
  domain: string;
  name: string;
  protocol: 'adapter' | 'ucp';
  adapterType: string;
  capabilities: string[];
  /** Raw UCP profile when the merchant supports UCP discovery */
  ucpProfile?: unknown;
}

/**
 * Adapter interface for connecting to real e-commerce platforms.
 * Implement this to add support for Shopify, WooCommerce, or any platform.
 */
export interface MerchantAdapter {
  /** Human-readable adapter name (e.g., 'shopify', 'woocommerce') */
  readonly adapterType: string;

  /** Discover/connect to a merchant by domain */
  discover(domain: string): Promise<MerchantAdapterDiscovery>;

  /** List products from the catalog */
  listProducts(options?: {
    page?: number;
    limit?: number;
    category?: string;
  }): Promise<{ products: MockProduct[]; total: number }>;

  /** Search products by keyword */
  searchProducts(
    query: string,
    limit?: number
  ): Promise<{ products: MockProduct[]; total: number; query: string }>;

  /** Get a single product by ID */
  getProduct(productId: string): Promise<MockProduct>;

  /** Get product reviews (optional) */
  getProductReviews?(
    productId: string,
    limit?: number
  ): Promise<ProductReviewResult>;

  /** Create a checkout session (optional — not all adapters support purchase) */
  createCheckout?(items: CartItem[]): Promise<{
    sessionId: string;
    totals: { subtotal: MoneyAmount; total: MoneyAmount };
    shippingOptions?: Array<{
      id: string;
      name: string;
      price: MoneyAmount;
      estimatedDays: string;
    }>;
  }>;

  /** Complete a checkout (optional) */
  completeCheckout?(
    sessionId: string,
    payment: { method: string; token?: string },
    shippingAddress: ShippingAddress
  ): Promise<{ orderId: string; status: string }>;
}

// ─── Review Types ───

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  title?: string;
  body: string;
  date: string;
  verified?: boolean;
}

export interface ProductReviewResult {
  productId: string;
  averageRating: number;
  totalReviews: number;
  reviews: ProductReview[];
}

// ─── Multi-Merchant Types ───

export interface MerchantContext {
  domain: string;
  protocol: 'ucp' | 'acp' | 'adapter';
  adapter?: MerchantAdapter;
  cart: CartItem[];
  checkoutSessionId: string | null;
  shippingAddress: ShippingAddress | null;
  orders: Map<string, MockOrder>;
  discoveryInfo?: Record<string, unknown>;
}

// ─── Webhook Types ───

export interface WebhookServerOptions {
  /** Port to listen on (default: 0 for random) */
  port?: number;
  /** HMAC secret for verifying webhook signatures */
  secret?: string;
  /** Callback for order update events */
  onOrderUpdate?: (event: OrderUpdateEvent) => void;
  /** Callback for any webhook event */
  onEvent?: (event: WebhookEvent) => void;
}

export interface OrderUpdateEvent {
  orderId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  merchantDomain: string;
  trackingNumber?: string;
  metadata?: Record<string, unknown>;
}

export type WebhookEvent =
  | { type: 'order.updated'; data: OrderUpdateEvent }
  | { type: 'order.shipped'; data: OrderUpdateEvent }
  | { type: 'order.delivered'; data: OrderUpdateEvent };
