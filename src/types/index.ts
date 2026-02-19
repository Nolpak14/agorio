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

// ─── SDK Client Types ───

export interface UcpClientOptions {
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation for testing */
  fetch?: typeof globalThis.fetch;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
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

// ─── Agent Types ───

export interface AgentOptions {
  /** LLM adapter to use for reasoning */
  llm: LlmAdapter;
  /** UCP client options */
  clientOptions?: UcpClientOptions;
  /** Maximum agent loop iterations (default: 20) */
  maxIterations?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Callback for each agent step */
  onStep?: (step: AgentStep) => void;
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
  error?: string;
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
