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

## New in v0.9 — SDK GA Polish

First release of the v1.0.0 GA program — locks the public API surface so the 90-day no-breaking-changes clock can start cleanly at v1.0.0-rc.1. ([v1.0 plan](./docs/releases/v1.0-plan.md) · [migration guide](./docs/releases/migration-0.x-to-1.0.md) · [v0.9 commits](https://github.com/Nolpak14/agorio/commits/main))

- 🧰 **MCP spec methods on `McpClient`** — `initialize`, `notifyInitialized`, `listTools` / `callTool`, `listResources` / `readResource`, `listPrompts` / `getPrompt`. Talk to any standard MCP server (GitHub MCP, Filesystem MCP, custom internal) without going through UCP discovery. Generic `call()` stays as the escape hatch.
- 🔍 **UCP introspection** — `getSigningKey(kid)`, `getPaymentHandler(id)` (full config + schemas), `getA2aEndpoint()`, `getExtensionsOf(parentName)`, `getCapabilityLineage(name)`. The profile metadata is finally addressable.
- 🔁 **ACP idempotency keys** — optional `idempotencyKey` param on `createCheckout` / `updateCheckout` / `completeCheckout` / `cancelCheckout`. Strongly recommended on `completeCheckout` since retries charge the buyer.
- 💸 **AP2 `RefundMandate`** — new mandate type modeled symmetrically on `IntentMandate`, with `originalMandateId` and optional `reason`. `Ap2Client.createRefundMandate()` issues one; existing `sign()` / `submitPayment()` handles the rest.
- 🛡️ **Cloud RBAC enforcement** — schema landed in v0.8; v0.9 wires it up. `requireRole(minimum)` gates server actions; team admin UI at `/team` (invite / change-role / remove) with Resend invite emails. Owner role immutable; only owners can grant admin; every action audit-logged.
- ⚠️ **Breaking:** `AgentOptions.experimental_ap2` removed (deprecated in v0.8). [One-line migration](./docs/releases/migration-0.x-to-1.0.md). 418 tests passing.

---

## New in v0.8 — Compliance & Hardening

EU AI Act enforcement begins **2 August 2026**. v0.8 ships the artifacts and primitives enterprise buyers want — without dropping any v0.7 capability. ([v0.8 plan](./docs/releases/v0.8-plan.md) · [security posture](./docs/security.md) · [compliance posture](./docs/compliance.md))

- 🛒 **BigCommerce adapter** — third real-merchant proof point with feature parity to Shopify + WooCommerce.
- 🔐 **Agent identity attestation** — HMAC-signed `X-Agorio-Attestation` header on outgoing requests. Merchants verify with a shared secret. `AgentAttestation.wrapFetch()` is a one-liner.
- 📑 **EU AI Act compliance export** — `GET /api/compliance/export?from=…&to=…&format=csv` emits Annex IV-aligned records direct from Cloud.
- 📜 **Audit log** — every state-changing dashboard action lands in a tenant-scoped append-only table. Visible at `cloud.agorio.dev/audit-log`.
- ✅ **AP2 GA** — `experimental_ap2` deprecated in favor of `ap2` (removed in v0.9). New `verifyMandateShape()` helper for receivers.
- 🛡️ **`docs/security.md` + `docs/compliance.md`** — OWASP top-10 posture, dependency advisories, vuln disclosure, GDPR / PCI / SOC 2 / ISO 27001 stances.

---

## New in v0.7 — B2B Procurement

Build procurement agents that comparison-shop merchants, pause for human approval above your threshold, attach a PO# to every cart, and stream the full audit trail to [Agorio Cloud](https://cloud.agorio.dev) — composed as a single `AgentChain` of sub-agents. ([Full demo](./examples/procurement) · [Landing](https://agorio.dev/procurement) · [v0.7 plan](./docs/releases/v0.7-plan.md))

```typescript
import { AgentChain, ShoppingAgent, ClaudeAdapter, agorioCloud } from '@agorio/sdk';
import { createProcurementPlugin } from '@agorio/plugin-procurement';
import { createApprovalWorkflowPlugin } from '@agorio/plugin-approval-workflow';

const cloud = agorioCloud({ apiKey: process.env.AGORIO_API_KEY! });

const plugins = () => [
  createApprovalWorkflowPlugin({ requireApprovalAbove: 1_000 }),
  createProcurementPlugin({
    vendors: VENDORS,
    expenseCategories: ['office-supplies', 'it-equipment', 'furniture'],
    requirePoOnCheckout: true,
  }),
];

const chain = new AgentChain()
  .add({ name: 'find-best-price', description: '...', build: (ctx) =>
    new ShoppingAgent({ llm, tracer: ctx.tracer, onLog: ctx.onLog, plugins: plugins() }) })
  .add({ name: 'request-approval', description: '...', build: (ctx) =>
    new ShoppingAgent({ llm, tracer: ctx.tracer, onLog: ctx.onLog, plugins: plugins() }) })
  .add({ name: 'checkout-and-track', description: '...', build: (ctx) =>
    new ShoppingAgent({ llm, tracer: ctx.tracer, onLog: ctx.onLog, plugins: plugins() }) });

await chain.run('Order 100 ergonomic chairs', { tracer: cloud.tracer, onLog: cloud.onLog });
```

v0.7 ships:

- **`AgentChain` + sub-agent primitive** — compose specialized agents (find-price → checkout → track) with first-class Cloud span hierarchy
- **`SessionStorage` interface** + `MemorySessionStorage`, `FileSessionStorage` in-tree, and a separate `@agorio/session-redis` package for production
- **`@agorio/plugin-procurement`** — sixth governance plugin (PO# tracking, vendor lookup, expense categorization)
- **HTTP retry + rate-limit primitives** (`createHttpClient`, `withRetry`, `TokenBucket`, `withRateLimit`) — drop into any adapter's `fetch:` option

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
| Cart and checkout flow | Manage sessions, shipping, payment state machine | 17 tools handle the full flow |
| LLM integration | Write provider-specific function calling code | Swap adapters: `GeminiAdapter`, `ClaudeAdapter`, `OpenAIAdapter` |
| Testing against merchants | Stand up your own mock server, write fixtures | `new MockMerchant()` -- full UCP-compliant server with 10 products |
| Chaos testing | Nothing built in | `{ latencyMs: 500, errorRate: 0.1 }` |
| Agent orchestration loop | Implement plan-act-observe from scratch | `agent.run("buy me headphones")` |

---

## What is Included

### Agent SDK (`@agorio/sdk`)

The core library. Everything below ships in a single package.

**ShoppingAgent** -- An LLM-driven agent that completes shopping tasks end-to-end. Uses a plan-act-observe loop with 17 built-in tools. Manages cart state, checkout sessions, and order history. Configurable iteration limits and step callbacks for observability.

**UcpClient** -- Discovers merchants via `/.well-known/ucp`, normalizes both array and object capability formats, resolves REST/MCP/A2A transports, and makes authenticated API calls with timeout handling.

**AcpClient** -- Manages ACP checkout sessions (create, get, update, complete, cancel) with Bearer token authentication, API versioning, and request tracing. Works with any ACP-compliant merchant.

**McpClient** -- JSON-RPC 2.0 client for MCP (Model Context Protocol) transport. Automatic transport detection: when a merchant declares MCP transport, the SDK uses it; otherwise falls back to REST. No configuration needed.

**LLM Adapters** -- Provider-agnostic interface. Ships with Gemini, Claude, OpenAI, and Ollama adapters, all with full function calling and streaming support. Ollama enables fully local/offline agents.

**Plugin System** -- Extend the agent with custom tools beyond the built-in 17. Register plugins with name, description, JSON Schema parameters, and an async handler. Name collision detection prevents conflicts with built-in tools.

**Observability** -- Structured logging via `onLog` callback, OpenTelemetry-compatible tracing via opt-in `tracer` interface (no hard dependency), and automatic usage metrics (token counts, tool call latency, total wall-clock time) on every `AgentResult`.

**CLI Tool (`npx agorio`)** -- Developer CLI for common tasks:
- `agorio mock` — start UCP, ACP, or MCP mock merchants
- `agorio discover <domain>` — discover merchant protocol and capabilities
- `agorio init [dir]` — scaffold a new agent project

**MockMerchant** -- A complete UCP-compliant Express server for testing. Serves a UCP profile at `/.well-known/ucp`, OpenAPI schema, product CRUD, search with filtering, full checkout flow with session management, and order tracking. Configurable latency and error rate for chaos testing.

**MockAcpMerchant** -- An ACP-compliant Express server for testing. Serves product catalog endpoints and all 5 ACP checkout session endpoints with Bearer auth, checkout state machine, and payment simulation.

**MockMcpMerchant** -- An MCP-only merchant server for testing JSON-RPC transport. Serves UCP profile with MCP transport binding and implements all shopping methods via JSON-RPC 2.0.

### 17 Built-in Shopping Tools (+ Plugins)

These are the function calling tools available to the agent during its reasoning loop. Each maps to a UCP/ACP operation:

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
| `switch_merchant` | Switch between multiple merchants (isolated cart/checkout per store) |
| `get_product_reviews` | Read customer reviews for a product |
| `apply_discount_code` | Apply a coupon or discount code at checkout |
| `compare_prices` | Compare prices for the same product across multiple stores |
| `subscribe_order_updates` | Subscribe to webhook notifications for order status changes |

Need more? Add custom tools via the [plugin system](#plugin-system).

---

## Quick Start

### Prerequisites

- Node.js 20 or later
- An API key from any supported provider:
  - [Gemini](https://aistudio.google.com/apikey) (free tier available)
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Anthropic](https://console.anthropic.com/)
  - Or use [Ollama](https://ollama.com/) for fully local/offline agents (no API key needed)

### Install

```bash
npm install @agorio/sdk
```

### Scaffold a new project (optional)

```bash
npx agorio init my-agent
cd my-agent
npm install
```

### Run your first agent

```typescript
import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@agorio/sdk';
// Or use any adapter:
// import { ClaudeAdapter } from '@agorio/sdk';
// import { OpenAIAdapter } from '@agorio/sdk';
// import { OllamaAdapter } from '@agorio/sdk';  // local, no API key

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
  // Or swap in Claude/OpenAI/Ollama with zero code changes:
  // llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
  // llm: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  // llm: new OllamaAdapter({ model: 'llama3.1' }),  // fully local
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

### Use the CLI

```bash
# Start a mock merchant for quick testing
npx agorio mock                    # UCP merchant on port 3456
npx agorio mock --acp --port 4000  # ACP merchant on port 4000
npx agorio mock --mcp              # MCP merchant (JSON-RPC transport)

# Discover a merchant's capabilities
npx agorio discover localhost:3456

# Scaffold a new project
npx agorio init my-agent
```

### Connect to a real store

Agorio ships merchant adapters for real e-commerce platforms. Pass one (or more) to `ShoppingAgent` and the agent auto-routes all product/checkout calls through it.

**Shopify** (Storefront API + UCP auto-detection for `*.myshopify.com`):

```typescript
import { ShoppingAgent, ShopifyAdapter, ClaudeAdapter } from '@agorio/sdk';

const adapter = new ShopifyAdapter({
  store: 'my-store',                          // your-store.myshopify.com
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_TOKEN!,
  // preferUcp: true (default) — uses /.well-known/ucp when available
});

const agent = new ShoppingAgent({
  llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  adapters: [adapter],
});

await agent.run('Search for running shoes under $100 and add the best one to cart');
```

**WooCommerce** (REST API v3 — any WordPress site with WooCommerce):

```typescript
import { ShoppingAgent, WooCommerceAdapter, ClaudeAdapter } from '@agorio/sdk';

// Read-only (browsing/search, no auth required on public stores)
const adapter = new WooCommerceAdapter({ url: 'https://my-store.com' });

// Write operations (checkout, orders) require consumer credentials
const adapterWithAuth = new WooCommerceAdapter({
  url: 'https://my-store.com',
  consumerKey: process.env.WC_CONSUMER_KEY!,
  consumerSecret: process.env.WC_CONSUMER_SECRET!,
});

const agent = new ShoppingAgent({
  llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  adapters: [adapterWithAuth],
});

await agent.run('Find the cheapest t-shirt and create an order for 2');
```

You can also probe a domain automatically — `isWooCommerceStore` hits `/wp-json/wc/v3/products` and returns `true` if the store exposes the WooCommerce REST API:

```typescript
import { isWooCommerceStore } from '@agorio/sdk';
const isWc = await isWooCommerceStore('some-shop.com'); // true | false
```

| Adapter | Platform | Auth | Auto-detected |
|---|---|---|---|
| `ShopifyAdapter` | Shopify | Storefront token | `*.myshopify.com` via UCP |
| `WooCommerceAdapter` | WooCommerce (WordPress) | Consumer key/secret (writes only) | `/wp-json/wc/v3` probe |

### Add custom tools with plugins

See the [Plugin Development Guide](docs/guides/plugin-development.md) for a full walk-through including enterprise lifecycle hooks, a wishlist plugin example, tests, and publishing instructions.


```typescript
const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
  plugins: [
    {
      name: 'check_price_history',
      description: 'Check historical prices for a product',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Product ID to check' },
        },
        required: ['productId'],
      },
      handler: async ({ productId }) => {
        // Your custom logic here
        return { prices: [{ date: '2026-01-01', price: '$89.99' }] };
      },
    },
  ],
});
```

### Add observability

```typescript
const agent = new ShoppingAgent({
  llm: adapter,
  onLog: (event) => {
    // Structured log events: level, message, data, timestamp
    console.log(`[${event.level}] ${event.message}`);
  },
  tracer: myOpenTelemetryTracer, // optional, OTel-compatible
});

const result = await agent.run('Buy headphones from shop.example.com');
console.log(result.usage?.totalTokens);     // Total tokens consumed
console.log(result.usage?.llmCalls);         // Number of LLM roundtrips
console.log(result.usage?.toolCallLatency);  // Per-tool latency in ms
console.log(result.usage?.totalLatencyMs);   // Wall-clock time
```

---

## Architecture

```
@agorio/sdk
  |
  |-- agent/
  |     ShoppingAgent          # LLM-driven plan-act-observe loop
  |                            # Manages cart, checkout, orders, plugins
  |
  |-- client/
  |     UcpClient              # UCP discovery + REST/MCP auto-transport
  |     AcpClient              # ACP checkout session client
  |     McpClient              # JSON-RPC 2.0 client for MCP transport
  |
  |-- llm/
  |     LlmAdapter (interface) # Provider-agnostic LLM contract
  |     GeminiAdapter          # Google Gemini with function calling
  |     ClaudeAdapter          # Anthropic Claude with function calling
  |     OpenAIAdapter          # OpenAI GPT with function calling
  |     OllamaAdapter          # Ollama for local/offline agents
  |     tools.ts               # 17 shopping tool definitions (JSON Schema)
  |
  |-- cli/
  |     agorio mock            # Start mock merchants (UCP/ACP/MCP)
  |     agorio discover        # Discover merchant capabilities
  |     agorio init            # Scaffold new agent project
  |
  |-- mock/
  |     MockMerchant           # Full UCP-compliant Express test server
  |     MockAcpMerchant        # Full ACP-compliant Express test server
  |     MockMcpMerchant        # MCP-only Express test server (JSON-RPC)
  |     fixtures.ts            # 10-product catalog + UCP profile builder
  |
  |-- types/
        UcpProfile, UcpService, UcpCapability, McpClientOptions
        AcpCheckoutSession, AcpClient, AcpLineItem
        LlmAdapter, ChatMessage, ToolCall, LlmStreamChunk
        AgentOptions, AgentResult, AgentStep, AgentStreamEvent
        AgentPlugin, AgentLogEvent, AgentTracer, AgentUsageSummary
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
| Ollama (local) | `OllamaAdapter` | Available | Via tool use |
| Any provider | Implement `LlmAdapter` | Build your own | Any |

To build your own adapter, implement the `LlmAdapter` interface and pass it to `ShoppingAgent`. See the [Gemini adapter source](src/llm/gemini.ts) for a reference implementation.

---

## Send traces to Agorio Cloud

Agorio Cloud is the hosted observability dashboard at [cloud.agorio.dev](https://cloud.agorio.dev). Pro subscribers get a per-run trace explorer with the tool-call timeline, LLM token counts, structured logs, and the final answer for every agent run. Setup is a single helper that spreads into `AgentOptions`:

```typescript
import { ShoppingAgent, agorioCloud, ClaudeAdapter } from '@agorio/sdk';

const cloud = agorioCloud({ apiKey: process.env.AGORIO_API_KEY! });

const agent = new ShoppingAgent({
  llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  ...cloud, // contributes tracer, onLog, onStep, onComplete
});

await agent.run('find me running shoes under $100');
// Trace appears at cloud.agorio.dev/traces within seconds.
```

Get an API key at [cloud.agorio.dev/api-keys](https://cloud.agorio.dev/api-keys) after subscribing. Network failures never break your agent — `agorioCloud()` swallows errors and only emits `console.warn` on bad/revoked keys or unreachable endpoints. See [docs/guides/cloud-setup.md](docs/guides/cloud-setup.md) for the full guide.

---

## Testing

Agorio uses [Vitest](https://vitest.dev/) and ships with **306 tests across 18 test files** covering the UCP client, ACP client, MCP transport, AP2 client, mock merchants, agent orchestration, plugins, enterprise plugin middleware, observability, streaming, CLI, webhooks, multi-merchant, Shopify adapter, WooCommerce adapter, Agorio Cloud helper, and all four LLM adapters.

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

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan with rationale and market context.

### Shipped

- **v0.2** — Multi-LLM (Claude, OpenAI), streaming, ACP client, dual-protocol agent, landing page. 113 tests.
- **v0.3** — MCP transport, plugin system, observability, CLI, Ollama adapter, reference agents. 191 tests.
- **v0.4** — Multi-merchant, Shopify adapter, webhooks, browser playground, 17 tools. 233 tests.
- **v0.4.2 (May 2026)** — Enterprise plugin system (5 governance plugins), Stripe billing, Neon Postgres, customer dashboard, Resend email, `agorio plugin` CLI. 252 tests.
- **v0.5 (May 2026)** — Open Core release: 5 plugins relicensed MIT and published as `@agorio/plugin-*`, WooCommerce adapter, Shopify UCP migration support, experimental AP2 client. 301 tests.
- **v0.6 (May 2026)** — Agorio Cloud MVP: `agorioCloud({ apiKey })` helper, hosted trace explorer at `cloud.agorio.dev`, API key management on Cloud, cross-subdomain auth, brand-native terminal-frame auth UI. 306 tests.

### Next (v0.6.1) — Cloud feature completion, ~3 weeks

- [ ] Hosted approval-workflow webhook receiver + click-to-approve UI
- [ ] Hosted, license-key-gated mock UCP/ACP/MCP merchants for CI pipelines
- [ ] Fleet view / org-level rollup
- [ ] Stale-run sweeper

### Then (v0.7) — B2B Procurement Vertical, Q3/Q4 2026

- [ ] Procurement reference agent with approval thresholds + full audit trail
- [ ] Agent composition primitives (chain specialized sub-agents)
- [ ] Persistent sessions, rate limiting, retry

### v0.8 — Compliance & Hardening, Q4 2026

- [ ] EU AI Act compliance export module
- [ ] Security audit, BotID integration, BigCommerce adapter

### v1.0 — Production GA, H1 2027

Stability + semver guarantees, full protocol coverage, enterprise SSO, comprehensive docs site.

---

## Agorio Pro

The SDK is free and MIT-licensed forever. **Agorio Pro** ($149/yr or $19/mo per team) is the upcoming hosted Cloud offering — observability dashboard, hosted approval webhooks, CI mock merchants, EU AI Act-ready audit exports.

The 5 governance plugins (spending controls, approval workflow, audit trail, agent identity, policy engine) will be relicensed MIT and published to npm in v0.5 — Pro will be about the hosted *service*, not the code.

See [agorio.dev/pricing](https://agorio.dev/pricing) and [docs/monetization.md](docs/monetization.md).

---

## Plugin CLI

Manage `@agorio/plugin-*` packages directly from the SDK CLI:

```bash
npx agorio plugin list                          # List installed @agorio plugins
npx agorio plugin install spending-controls     # Install a plugin from npm
npx agorio plugin info spending-controls        # Show metadata for an installed plugin
```

---

## Project Structure

```
agorio/
  src/
    index.ts                    # Public API exports
    types/index.ts              # All TypeScript types
    client/
      ucp-client.ts             # UCP discovery + REST/MCP auto-transport
      acp-client.ts             # ACP checkout session client
      mcp-client.ts             # JSON-RPC 2.0 client for MCP transport
    llm/
      gemini.ts                 # Google Gemini adapter (+ streaming)
      claude.ts                 # Anthropic Claude adapter (+ streaming)
      openai.ts                 # OpenAI GPT adapter (+ streaming)
      ollama.ts                 # Ollama adapter for local models
      tools.ts                  # 17 shopping tool definitions
    agent/shopping-agent.ts     # Agent orchestrator (plugins, observability)
    cli/
      index.ts                  # CLI entry point (npx agorio)
      commands/mock.ts          # agorio mock command
      commands/discover.ts      # agorio discover command
      commands/init.ts          # agorio init command
    mock/
      mock-merchant.ts          # UCP-compliant test server
      mock-acp-merchant.ts      # ACP-compliant test server
      mock-mcp-merchant.ts      # MCP-only test server (JSON-RPC)
      fixtures.ts               # Product catalog + profile builder
  tests/
    ucp-client.test.ts          # 13 tests
    mcp-client.test.ts          # 22 tests
    mock-merchant.test.ts       # 17 tests
    shopping-agent.test.ts      # 7 tests
    plugin-system.test.ts       # 9 tests
    observability.test.ts       # 13 tests
    claude-adapter.test.ts      # 18 tests
    openai-adapter.test.ts      # 18 tests
    ollama-adapter.test.ts      # 21 tests
    streaming.test.ts           # 12 tests
    acp-client.test.ts          # 20 tests
    acp-agent.test.ts           # 8 tests
    cli.test.ts                 # 13 tests
    multi-merchant.test.ts      # 12 tests
    shopify-adapter.test.ts     # 15 tests
    shopify-ucp-migration.test.ts # 10 tests
    woocommerce-adapter.test.ts # 21 tests
    ap2-client.test.ts          # 21 tests
    webhook.test.ts             # 15 tests
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and the PR process.

Areas where contributions are especially valuable:

- **LLM adapters** -- Mistral, Cohere, or any other provider (implement `LlmAdapter`)
- **Plugins** -- custom tools for wishlists, reviews, returns, price alerts
- **Reference agents** -- example agents that demonstrate real use cases
- **Documentation** -- tutorials, guides, examples
- **Bug reports** -- especially around edge cases in UCP/MCP profile parsing

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
