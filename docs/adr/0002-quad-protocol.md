# 0002 — Quad-protocol coverage (UCP + ACP + AP2 + MCP)

**Date:** 2026-05-17
**Status:** Accepted

## Context

There is no single accepted protocol for agentic commerce. The four candidates as of mid-2026 are:

- **UCP** (Universal Commerce Protocol) — open, REST/MCP dual-transport, discovery-first
- **ACP** (Agentic Commerce Protocol) — Stripe-led, checkout-session-centric
- **AP2** (Agent Payments Protocol) — FIDO Alliance, mandate-based payment signing
- **MCP** (Model Context Protocol) — Anthropic-led, JSON-RPC tools surface

## Decision

agorio ships clients for all four, with auto-detection inside `ShoppingAgent`:

- `UcpClient` is the discovery layer; it can route to a `McpClient` when a merchant exposes the
  MCP transport variant.
- `AcpClient` is invoked when the merchant exposes an ACP checkout session endpoint.
- `Ap2Client` is **payment-layer** and orthogonal — it composes with any of the above.

The agent's tool surface remains UCP-shaped; protocol clients are wired in by adapter detection,
not by the LLM.

## Consequences

- We avoid betting on a single emerging standard before the market has chosen one.
- Adapter authors only need to think in UCP terms — the four-protocol fan-out is hidden.
- Maintaining four clients is real cost. We mitigate by sharing types and HTTP primitives
  (`createHttpClient`) across them.
