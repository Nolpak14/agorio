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

// Core client
export { UcpClient, UcpDiscoveryError, UcpApiError } from './client/ucp-client.js';

// LLM adapters
export { GeminiAdapter } from './llm/gemini.js';
export type { GeminiAdapterOptions } from './llm/gemini.js';

// Agent
export { ShoppingAgent } from './agent/shopping-agent.js';

// Tools
export { SHOPPING_AGENT_TOOLS } from './llm/tools.js';

// Mock server
export { MockMerchant } from './mock/mock-merchant.js';
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

  // Agent types
  AgentOptions,
  AgentStep,
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
