/**
 * @ucptools/agent-sdk
 *
 * SDK for building AI shopping agents that interact with UCP-enabled merchants.
 *
 * @example
 * ```typescript
 * import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@ucptools/agent-sdk';
 *
 * // Start a mock merchant for testing
 * const merchant = new MockMerchant();
 * await merchant.start();
 *
 * // Create an agent with Gemini
 * const agent = new ShoppingAgent({
 *   llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY! }),
 *   verbose: true,
 * });
 *
 * // Run a shopping task
 * const result = await agent.run(
 *   `Go to ${merchant.domain} and buy me wireless headphones`
 * );
 *
 * console.log(result.answer);
 * console.log(result.checkout?.orderId);
 *
 * await merchant.stop();
 * ```
 */

// Core clients
export { UcpClient, UcpDiscoveryError, UcpApiError } from './client/ucp-client.js';
export { AcpClient, AcpApiError } from './client/acp-client.js';
export { McpClient, McpError } from './client/mcp-client.js';

// LLM adapters
export { GeminiAdapter } from './llm/gemini.js';
export type { GeminiAdapterOptions } from './llm/gemini.js';
export { ClaudeAdapter } from './llm/claude.js';
export type { ClaudeAdapterOptions } from './llm/claude.js';
export { OpenAIAdapter } from './llm/openai.js';
export type { OpenAIAdapterOptions } from './llm/openai.js';
export { OllamaAdapter } from './llm/ollama.js';
export type { OllamaAdapterOptions } from './llm/ollama.js';

// Agent
export { ShoppingAgent } from './agent/shopping-agent.js';

// Tools
export { SHOPPING_AGENT_TOOLS } from './llm/tools.js';

// Mock servers
export { MockMerchant } from './mock/mock-merchant.js';
export { MockAcpMerchant } from './mock/mock-acp-merchant.js';
export { MockMcpMerchant } from './mock/mock-mcp-merchant.js';
export { DEFAULT_PRODUCTS, buildMockProfile } from './mock/fixtures.js';

// Types
export type {
  // UCP types
  UcpProfile,
  UcpService,
  UcpCapability,
  RestTransport,
  McpTransport,
  A2aTransport,
  PaymentHandler,
  JwkKey,

  // MCP types
  McpClientOptions,
  MockMcpMerchantOptions,
  TransportPreference,

  // ACP types
  AcpClientOptions,
  AcpCheckoutSession,
  AcpCheckoutStatus,
  AcpLineItem,
  AcpMoney,
  AcpShippingAddress,
  MockAcpMerchantOptions,

  // Client types
  UcpClientOptions,
  DiscoveryResult,
  NormalizedService,

  // LLM types
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  LlmResponse,
  LlmStreamChunk,

  // Agent types
  AgentOptions,
  AgentStep,
  AgentStreamEvent,
  AgentResult,
  CheckoutResult,

  // Shopping types
  CartItem,
  CartState,
  MoneyAmount,
  MockProduct,
  MockOrder,
  ShippingAddress,

  // Mock types
  MockMerchantOptions,
} from './types/index.js';
