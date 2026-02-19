<p align="center">
  <strong>agorio</strong>
</p>

<p align="center">
  The open-source toolkit for building AI commerce agents.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agorio/sdk"><img src="https://img.shields.io/npm/v/@agorio/sdk.svg" alt="npm version"></a>
  <a href="https://github.com/agorio/agorio/actions"><img src="https://github.com/agorio/agorio/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/agorio/agorio/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://agorio.dev"><img src="https://img.shields.io/badge/docs-agorio.dev-black" alt="Docs"></a>
</p>

---

Agorio gives you everything you need to build AI agents that can discover merchants, browse products, and complete real purchases -- using the [UCP](https://github.com/Universal-Commerce-Protocol/ucp) (Google/Shopify) and [ACP](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) (OpenAI/Stripe) open commerce protocols. It works with any LLM. Ship a shopping agent in 20 lines of code.

```typescript
import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@agorio/sdk';

// Start a mock merchant for testing
const merchant = new MockMerchant();
await merchant.start();

// Create an agent powered by Gemini
const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
  verbose: true,
});

// Tell the agent what to buy
const result = await agent.run(
  `Go to ${merchant.domain} and buy me wireless headphones`
);

console.log(result.answer);           // "I found ProSound Wireless Headphones..."
console.log(result.checkout?.orderId); // "ord_1708300000_abc123"

await merchant.stop();
```

That is a fully working agent that discovers a merchant via UCP, searches the catalog, adds items to a cart, goes through checkout with shipping and payment, and returns an order confirmation. The entire purchase flow, automated by an LLM.

---

## Why Agorio

The agentic commerce wave is here. Google AI Mode has 75M+ daily active users shopping through AI. Shopify is making 4.8M merchants discoverable via MCP. Stripe is enabling 1.5M merchants to accept agent payments with one line of code. Visa and Mastercard are enabling all US cardholders for agent transactions by holiday 2026.

Two open protocols are emerging as the standard:

- **UCP** (Universal Commerce Protocol) -- backed by Google, Shopify, Etsy, Wayfair, Target, Walmart, Visa, Mastercard. [2,350 GitHub stars](https://github.com/Universal-Commerce-Protocol/ucp).
- **ACP** (Agent Commerce Protocol) -- backed by OpenAI, Stripe, PayPal, Shopify. [1,200 GitHub stars](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol).

But there is no developer toolkit for building on top of them. LangChain and CrewAI are generic agent frameworks. Apify is focused on web scraping. Nobody provides commerce-specific tools, protocol clients, or test infrastructure.

Agorio fills that gap.

| Capability | Building from Scratch | With Agorio |
|---|---|---|
| UCP merchant discovery | Parse `/.well-known/ucp` yourself, handle both capability formats, normalize services | `client.discover("shop.example.com")` |
| Product search and browsing | Build REST client, handle pagination, parse responses | Built-in agent tool, automatic |
| Cart and checkout flow | Manage sessions, shipping, payment state machine | 12 tools handle the full flow |
| LLM integration | Write provider-specific function calling code | Swap adapters: `GeminiAdapter`, `ClaudeAdapter`, `OpenAIAdapter` |
| Testing against merchants | Stand up your own mock server, write fixtures | `new MockMerchant()` -- full UCP-compliant server with 10 products |
| Chaos testing | Nothing built in | `{ latencyMs: 500, errorRate: 0.1 }` |
| Agent orchestration loop | Implement plan-act-observe from scratch | `agent.run("buy me headphones")` |

---

## What is Included

### Agent SDK (`@agorio/sdk`)

The core library. Everything below ships in a single package.

**ShoppingAgent** -- An LLM-driven agent that completes shopping tasks end-to-end. Uses a plan-act-observe loop with 12 built-in tools. Manages cart state, checkout sessions, and order history. Configurable iteration limits and step callbacks for observability.

**UcpClient** -- Discovers merchants via `/.well-known/ucp`, normalizes both array and object capability formats, resolves REST/MCP/A2A transports, and makes authenticated API calls with timeout handling.

**AcpClient** -- Manages ACP checkout sessions (create, get, update, complete, cancel) with Bearer token authentication, API versioning, and request tracing. Works with any ACP-compliant merchant.

**LLM Adapters** -- Provider-agnostic interface. Ships with Gemini, Claude, and OpenAI adapters, all with full function calling and streaming support.

**MockMerchant** -- A complete UCP-compliant Express server for testing. Serves a UCP profile at `/.well-known/ucp`, OpenAPI schema, product CRUD, search with filtering, full checkout flow with session management, and order tracking. Configurable latency and error rate for chaos testing.

**MockAcpMerchant** -- An ACP-compliant Express server for testing. Serves product catalog endpoints and all 5 ACP checkout session endpoints with Bearer auth, checkout state machine, and payment simulation.

### 12 Built-in Shopping Tools

These are the function calling tools available to the agent during its reasoning loop. Each maps to a UCP operation:

| Tool | Description |
|---|---|
| `discover_merchant` | Fetch and parse a merchant's UCP profile by domain |
| `list_capabilities` | List what the merchant supports (checkout, orders, fulfillment, discounts) |
| `browse_products` | Paginated product catalog with category filtering |
| `search_products` | Keyword search across product names and descriptions |
| `get_product` | Detailed product info including variants and pricing |
| `add_to_cart` | Add products to cart with quantity and variant selection |
| `view_cart` | View current cart contents and subtotal |
| `remove_from_cart` | Remove items from cart |
| `initiate_checkout` | Start checkout session, get shipping options |
| `submit_shipping` | Submit shipping address |
| `submit_payment` | Complete payment and receive order confirmation |
| `get_order_status` | Check status of an existing order |

---

## Quick Start

### Prerequisites

- Node.js 20 or later
- An API key from any supported provider:
  - [Gemini](https://aistudio.google.com/apikey) (free tier available)
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Anthropic](https://console.anthropic.com/)

### Install

```bash
npm install @agorio/sdk
```

### Run your first agent

```typescript
import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@agorio/sdk';
// Or use any adapter:
// import { ClaudeAdapter } from '@agorio/sdk';
// import { OpenAIAdapter } from '@agorio/sdk';

// 1. Start a mock merchant (UCP-compliant test server)
const merchant = new MockMerchant({ name: 'TechShop' });
await merchant.start();

// 2. Create an agent with your LLM of choice
const agent = new ShoppingAgent({
  llm: new GeminiAdapter({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',   // default
    temperature: 0.7,
  }),
  // Or swap in Claude/OpenAI with zero code changes:
  // llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
  // llm: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  verbose: true,  // logs each think/tool/result step
  maxIterations: 20,
  onStep: (step) => {
    // Optional: observe every agent step in real time
    if (step.type === 'tool_call') {
      console.log(`Calling ${step.toolName}...`);
    }
  },
});

// 3. Give it a task
const result = await agent.run(
  `Go to ${merchant.domain} and buy me a mechanical keyboard with brown switches.
   Ship to: Jane Doe, 123 Main St, San Francisco, CA 94102, US`
);

// 4. Inspect the result
console.log(result.success);            // true
console.log(result.answer);             // Natural language summary
console.log(result.checkout?.orderId);   // "ord_..."
console.log(result.checkout?.total);     // { amount: "95.98", currency: "USD" }
console.log(result.iterations);          // Number of agent loop iterations
console.log(result.steps.length);        // Full step trace for debugging

await merchant.stop();
```

### Use the UCP client directly

If you want lower-level control without the agent loop:

```typescript
import { UcpClient } from '@agorio/sdk';

const client = new UcpClient({ timeoutMs: 10000 });

// Discover a merchant
const discovery = await client.discover('shop.example.com');
console.log(discovery.version);           // "2026-01-11"
console.log(discovery.capabilities);      // [{ name: "dev.ucp.shopping.checkout", ... }]
console.log(discovery.services);          // [{ name: "dev.ucp.shopping", transports: { rest, mcp, a2a } }]
console.log(discovery.paymentHandlers);   // [{ id: "stripe", name: "Stripe" }]

// Check capabilities
client.hasCapability('dev.ucp.shopping.checkout');  // true

// Call merchant APIs
const products = await client.callApi('/products');
const product = await client.callApi('/products/prod_123');
const order = await client.callApi('/checkout', {
  method: 'POST',
  body: { items: [{ productId: 'prod_123', quantity: 1 }] },
});
```

### Configure the mock merchant

```typescript
import { MockMerchant } from '@agorio/sdk/mock';

const merchant = new MockMerchant({
  port: 3456,             // Fixed port (default: random)
  name: 'Chaos Shop',
  latencyMs: 200,         // Simulate 200ms network latency
  errorRate: 0.05,        // 5% of requests fail with 500
  products: [             // Custom product catalog
    {
      id: 'custom_1',
      name: 'Custom Widget',
      description: 'A test product',
      price: { amount: '9.99', currency: 'USD' },
      category: 'Widgets',
      inStock: true,
    },
  ],
});
```

---

## Architecture

```
@agorio/sdk
  |
  |-- agent/
  |     ShoppingAgent          # LLM-driven plan-act-observe loop
  |                            # Manages cart, checkout, orders
  |
  |-- client/
  |     UcpClient              # UCP discovery + REST/MCP/A2A client
  |     AcpClient              # ACP checkout session client
  |
  |-- llm/
  |     LlmAdapter (interface) # Provider-agnostic LLM contract
  |     GeminiAdapter          # Google Gemini with function calling
  |     ClaudeAdapter          # Anthropic Claude with function calling
  |     OpenAIAdapter          # OpenAI GPT with function calling
  |     tools.ts               # 12 shopping tool definitions (JSON Schema)
  |
  |-- mock/
  |     MockMerchant           # Full UCP-compliant Express test server
  |     MockAcpMerchant        # Full ACP-compliant Express test server
  |     fixtures.ts            # 10-product catalog + UCP profile builder
  |
  |-- types/
        UcpProfile, UcpService, UcpCapability
        AcpCheckoutSession, AcpClient, AcpLineItem
        LlmAdapter, ChatMessage, ToolCall, LlmStreamChunk
        AgentOptions, AgentResult, AgentStep, AgentStreamEvent
        CartItem, CheckoutResult, MockProduct
```

The `LlmAdapter` interface is the key abstraction:

```typescript
interface LlmAdapter {
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmResponse>;
  chatStream?(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncIterable<LlmStreamChunk>;
  readonly modelName: string;
}
```

Any LLM that supports function calling can implement this interface. The `ShoppingAgent` does not know or care which model is behind it. The optional `chatStream` method enables real-time streaming via `agent.runStream()`.

---

## Supported LLMs

| Provider | Adapter | Status | Function Calling |
|---|---|---|---|
| Google Gemini | `GeminiAdapter` | Available | Native |
| Anthropic Claude | `ClaudeAdapter` | Available | Native |
| OpenAI / ChatGPT | `OpenAIAdapter` | Available | Native |
| Ollama (local) | `OllamaAdapter` | Planned | Via tool use |
| Any provider | Implement `LlmAdapter` | Build your own | Any |

To build your own adapter, implement the `LlmAdapter` interface and pass it to `ShoppingAgent`. See the [Gemini adapter source](src/llm/gemini.ts) for a reference implementation.

---

## Testing

Agorio uses [Vitest](https://vitest.dev/) and ships with 113 tests covering the UCP client, ACP client, mock merchants, agent orchestration, streaming, and all three LLM adapters.

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run a specific test file
npm test -- tests/ucp-client.test.ts
```

The mock merchant makes it easy to write integration tests for your own agents:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockMerchant, UcpClient } from '@agorio/sdk';

describe('my agent', () => {
  let merchant: MockMerchant;
  let client: UcpClient;

  beforeAll(async () => {
    merchant = new MockMerchant();
    await merchant.start();
    client = new UcpClient();
    await client.discover(merchant.domain);
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('discovers the merchant', () => {
    expect(client.hasCapability('dev.ucp.shopping.checkout')).toBe(true);
  });

  it('searches products', async () => {
    const result = await client.callApi('/products/search?q=headphones');
    expect(result).toHaveProperty('products');
  });
});
```

---

## Roadmap

### Shipped (v0.2)
- [x] ShoppingAgent with plan-act-observe loop
- [x] UcpClient with discovery and REST API support
- [x] GeminiAdapter, ClaudeAdapter, OpenAIAdapter — all with native function calling
- [x] Streaming support — `runStream()` async generator + `chatStream()` on all adapters
- [x] AcpClient — full ACP checkout session lifecycle (create, get, update, complete, cancel)
- [x] MockAcpMerchant — ACP-compliant Express test server
- [x] Dual-protocol ShoppingAgent — auto-detects UCP vs ACP on discovery
- [x] MockMerchant with full UCP checkout flow
- [x] 12 built-in shopping tools
- [x] 113 tests passing

### Next (v0.3)
- [ ] Multi-merchant comparison agent
- [ ] Ollama adapter for local/offline agents
- [ ] Reference agents: price comparison, product research, deal finder
- [ ] MCP transport support (beyond REST)
- [ ] Agent marketplace

---

## Project Structure

```
agorio/
  src/
    index.ts                    # Public API exports
    types/index.ts              # All TypeScript types
    client/
      ucp-client.ts             # UCP discovery + REST client
      acp-client.ts             # ACP checkout session client
    llm/
      gemini.ts                 # Google Gemini adapter (+ streaming)
      claude.ts                 # Anthropic Claude adapter (+ streaming)
      openai.ts                 # OpenAI GPT adapter (+ streaming)
      tools.ts                  # 12 shopping tool definitions
    agent/shopping-agent.ts     # Agent orchestrator (dual-protocol)
    mock/
      mock-merchant.ts          # UCP-compliant test server
      mock-acp-merchant.ts      # ACP-compliant test server
      fixtures.ts               # Product catalog + profile builder
  tests/
    ucp-client.test.ts          # 13 tests
    mock-merchant.test.ts       # 17 tests
    shopping-agent.test.ts      # 7 tests
    claude-adapter.test.ts      # 18 tests
    openai-adapter.test.ts      # 18 tests
    streaming.test.ts           # 12 tests
    acp-client.test.ts          # 20 tests
    acp-agent.test.ts           # 8 tests
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and the PR process.

Areas where contributions are especially valuable:

- **LLM adapters** -- Ollama, Mistral, or any other provider
- **Shopping tools** -- new tools for wishlists, reviews, returns, price alerts
- **Reference agents** -- example agents that demonstrate real use cases
- **Documentation** -- tutorials, guides, examples
- **Bug reports** -- especially around edge cases in UCP profile parsing

---

## Ecosystem Context

Agorio builds on two open commerce protocols that are being adopted at scale:

**UCP** (Universal Commerce Protocol) is backed by Google, Shopify, Etsy, Wayfair, Target, Walmart, Visa, Mastercard, Stripe, and PayPal. It defines how AI agents discover merchants and their capabilities via `/.well-known/ucp` profiles. SDKs exist in JavaScript, Python, Java, .NET, Go, PHP, and Dart.

**ACP** (Agent Commerce Protocol) is backed by OpenAI, Stripe, PayPal, and Shopify. It focuses on the payment and transaction layer for agent commerce.

The merchant infrastructure is growing rapidly:
- 4.8M Shopify merchants are discoverable via Catalog MCP
- 1.5M Stripe merchants can enable ACP with one line of code
- 35M PayPal merchants are coming online via Agent Ready
- Visa and Mastercard are enabling all US cardholders by late 2026

Agorio is an independent, community-driven project. It is not affiliated with Google, Shopify, OpenAI, or Stripe. UCP and ACP are open standards maintained by their respective organizations.

---

## License

[MIT](LICENSE) -- use it however you want.

---

<p align="center">
  <a href="https://agorio.dev">Website</a> &middot;
  <a href="https://github.com/agorio/agorio/issues">Issues</a> &middot;
  <a href="https://github.com/agorio/agorio/discussions">Discussions</a>
</p>
