# 0005 — Sub-agent + AgentChain primitives instead of an internal orchestrator

**Date:** 2026-05-12
**Status:** Accepted

## Context

The B2B procurement vertical (v0.7) needs multi-stage workflows: find-best-price → request-
approval → checkout-and-track. The obvious shapes were:

1. Build a `WorkflowAgent` class that internally drives multiple `ShoppingAgent` instances.
2. Expose `subAgents:` on `AgentOptions` so the LLM can call them like tools.
3. Ship an external `AgentChain` orchestrator that takes pre-built sub-agents and runs them.

## Decision

Ship **both 2 and 3** — they cover different ergonomic needs.

- `subAgents:` lets the **LLM** decide when to invoke a sub-agent (auto-registers
  `invoke_sub_agent` tool, depth-3 recursion guard by default).
- `AgentChain` lets **the developer** wire a deterministic pipeline with output→input piping
  via `inputFrom`. Halts on first failure. Aggregates usage across steps.

Both use the same `SubAgent` type. Both wrap tracer/onLog so Cloud renders the call tree
correctly via `parent_span_id` and `sub_agent_name` attributes.

## Consequences

- Customers can start with `AgentChain` (deterministic), then graduate to `subAgents:` (LLM-
  driven) as their workflows become harder to enumerate up front.
- We avoid building a workflow engine. Both primitives are <300 LOC; the complexity stays on
  the developer's side, where they can debug it.
- The cost is two primitives for what some users will see as one job. The procurement example
  in `examples/procurement/` uses `AgentChain` to keep the headline demo predictable.
