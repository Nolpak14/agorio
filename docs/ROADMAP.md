# Agorio SDK Roadmap

## v0.1.0 - Foundation

Released: February 19, 2026

- Gemini adapter (Google Generative AI) with function calling
- UCP client with `/.well-known/ucp` discovery and REST API
- ShoppingAgent with plan-act-observe loop
- 12 shopping tool definitions (JSON Schema)
- MockMerchant — UCP-compliant Express test server
- Full product CRUD, search, checkout flow, order tracking
- LlmAdapter interface for any LLM with function calling
- 37 tests (Vitest)
- Published as `@agorio/sdk` on npm

## v0.2.0 - Multi-LLM & Protocol Expansion

Released: February 19, 2026

- [x] Claude adapter (#1) — Anthropic SDK with function calling
- [x] OpenAI adapter (#2) — GPT-4o with function calling
- [x] Streaming support (#5) — `runStream()` async generator + `chatStream()` on all adapters
- [x] ACP client (#6) — Full checkout session lifecycle (create, get, update, complete, cancel)
- [x] MockAcpMerchant — ACP-compliant Express test server
- [x] Dual-protocol ShoppingAgent — auto-detects UCP vs ACP on merchant discovery
- [x] agorio.dev landing page (#3)
- [x] 113 tests passing (Vitest)

## v0.3.0 - Marketplace Foundation & Observability

Released: February 20, 2026

- [x] MCP transport support (#22) — JSON-RPC 2.0 client with auto-detection and fallback
- [x] Plugin system (#23) — Custom tool extension point with name, JSON Schema, async handler
- [x] Observability (#24) — Structured logging, OpenTelemetry-compatible tracing, usage metrics
- [x] CLI tool (#25) — `npx agorio` with mock, discover, and init commands
- [x] Contributing guide (#26)
- [x] Ollama adapter (#27) — Local/offline LLM support
- [x] Reference agents (#28)
- [x] 191 tests passing (Vitest, 13 test files)

## v0.4.0 (Current) - Multi-Merchant & Real Commerce

Released: February 27, 2026

- [x] Multi-merchant architecture — isolated per-merchant state, price comparison across stores
- [x] Shopify adapter — Storefront API integration, auto-detected by domain
- [x] 4 new shopping tools — switch_merchant, compare_prices, get_product_reviews, apply_discount_code
- [x] Webhook support — WebhookServer with HMAC-SHA256, MockMerchant order lifecycle simulation
- [x] subscribe_order_updates tool — agent-driven webhook subscription (17th tool)
- [x] Browser playground — interactive client-side agent at agorio.dev/playground
- [x] Landing page update — PlaygroundPreview section, v0.4 feature cards, updated stats
- [x] 233 tests passing (Vitest, 15 test files)

See [docs/v0.4-plan.md](v0.4-plan.md) for full plan and analysis.

## v0.5.0 - Documentation & Platform Expansion

Target: Q1 2026

- [ ] Full documentation site (agorio.dev — guides, API reference, tutorials)
- [ ] WooCommerce adapter
- [ ] Agent composition (chaining specialized sub-agents)
- [ ] Persistent sessions (resume interrupted shopping)
- [ ] Rate limiting & retry for production HTTP clients

## v1.0.0 - Production Ready

Target: H2 2026

- [ ] Production-ready with stability guarantees
- [ ] Full UCP protocol coverage (all capabilities and extensions)
- [ ] Full ACP protocol coverage
- [ ] Comprehensive documentation site (agorio.dev)
- [ ] Multiple real-world merchant integrations (Shopify, WooCommerce, BigCommerce)
- [ ] Security audit and hardening
- [ ] Semantic versioning commitment

---

## How to Contribute

Check [GitHub Issues](https://github.com/Nolpak14/agorio/issues) for tasks labeled `good first issue`. See the main README for development setup instructions.
