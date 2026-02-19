# CLAUDE.md

## Project Overview

Agorio is an open-source TypeScript SDK for building AI commerce agents using UCP (Universal Commerce Protocol) and ACP (Agentic Commerce Protocol). Ships as `@agorio/sdk` on npm.

**Live:** https://www.npmjs.com/package/@agorio/sdk
**Repo:** https://github.com/Nolpak14/agorio
**Website:** https://agorio.dev (not yet live)

## Commands

```bash
npm run build       # TypeScript compilation
npm test            # Vitest tests (37 tests)
npm run test:watch  # Watch mode
npm run typecheck   # tsc --noEmit
```

## Architecture

```
src/
  index.ts                    # Public API exports
  types/index.ts              # All TypeScript types
  client/ucp-client.ts        # UCP discovery + REST client
  llm/
    gemini.ts                 # Google Gemini adapter (function calling)
    tools.ts                  # 12 shopping tool definitions (JSON Schema)
    types.ts                  # LLM adapter interface
  agent/shopping-agent.ts     # LLM-driven plan-act-observe loop
  mock/
    mock-merchant.ts          # UCP-compliant Express test server
    fixtures.ts               # Product catalog + UCP profile builder
tests/
  ucp-client.test.ts          # 13 tests
  mock-merchant.test.ts       # 17 tests
  shopping-agent.test.ts      # 7 tests
```

## Key Abstractions

- **LlmAdapter** interface: `chat(messages, tools) => LlmResponse`. Any LLM with function calling can implement this.
- **ShoppingAgent**: Takes an LlmAdapter, runs a plan-act-observe loop with 12 shopping tools.
- **UcpClient**: Discovers merchants via `/.well-known/ucp`, normalizes capabilities, makes REST API calls.
- **MockMerchant**: Express server with full UCP profile, product CRUD, search, checkout flow, order tracking.

## Publishing

```bash
npm run build
npm publish --access public
```

Package is scoped under `@agorio` npm org (owner: nolpak14).

## Related Project

This SDK was extracted from [ucptools](https://github.com/Nolpak14/ucp-tools). Strategy docs live there:
- `docs/strategy/agorio-pmf-analysis.md`
- `docs/strategy/shopping-agents-platform-plan.md`
- `docs/strategy/shopping-agents-session-summary.md`

## Tech Stack

- TypeScript 5.6, ES2022 target, ESM modules
- Vitest for testing
- Express (peer dependency) for MockMerchant
- @google/generative-ai for GeminiAdapter
