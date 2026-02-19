# Contributing to Agorio

Thank you for your interest in contributing to Agorio. This document covers everything you need to get started.

## Development Setup

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- A code editor with TypeScript support

### Getting Started

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/agorio.git
cd agorio
```

2. Install dependencies:

```bash
npm install
```

3. Run the tests to make sure everything works:

```bash
npm test
```

4. Build the project:

```bash
npm run build
```

5. Run the type checker:

```bash
npm run typecheck
```

## Project Structure

```
src/
  index.ts                    # Public API exports
  types/index.ts              # All TypeScript types
  client/ucp-client.ts        # UCP discovery + REST client
  llm/
    gemini.ts                 # Google Gemini adapter
    tools.ts                  # Shopping tool definitions
  agent/shopping-agent.ts     # Agent orchestrator
  mock/
    mock-merchant.ts          # UCP-compliant test server
    fixtures.ts               # Product catalog + profile builder
tests/
  ucp-client.test.ts
  mock-merchant.test.ts
  shopping-agent.test.ts
```

## Making Changes

### Branch Naming

- `feature/description` -- new features
- `fix/description` -- bug fixes
- `docs/description` -- documentation updates
- `refactor/description` -- code improvements without behavior changes

### Code Style

- TypeScript strict mode is enabled
- Use ES modules (`import`/`export`, not `require`)
- Use `interface` for public API types, `type` for internal unions and intersections
- Add JSDoc comments to all exported functions, classes, and interfaces
- Keep functions focused -- prefer small functions over large ones

### Writing Tests

Every change should include tests. We use [Vitest](https://vitest.dev/).

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run a specific test file
npm test -- tests/ucp-client.test.ts

# Run with coverage
npm test -- --coverage
```

When adding a new LLM adapter:
- Add unit tests that mock the provider's API
- Test function calling conversion (JSON Schema to provider format)
- Test error handling (rate limits, invalid responses, timeouts)

When adding a new shopping tool:
- Add the tool definition to `src/llm/tools.ts`
- Add the execution handler to `src/agent/shopping-agent.ts`
- Add the corresponding mock endpoint to `src/mock/mock-merchant.ts`
- Write tests for all three layers

### Type Checking

Always run the type checker before submitting:

```bash
npm run typecheck
```

This command can take 1-3 minutes. Wait for it to complete -- no output means it is still running.

## Submitting a Pull Request

1. Create a branch from `main`
2. Make your changes with tests
3. Run `npm test` and `npm run typecheck` -- both must pass
4. Write a clear commit message describing what changed and why
5. Push your branch and open a pull request
6. Fill out the PR template with a summary, test plan, and any breaking changes

### PR Review Process

- All PRs require at least one approving review
- CI must pass (tests + type checking)
- Keep PRs focused -- one feature or fix per PR

## Areas Where Help is Needed

Here are the most impactful areas for contribution:

### LLM Adapters
New adapters for Claude (Anthropic), OpenAI, and Ollama. Each adapter implements the `LlmAdapter` interface from `src/types/index.ts`. See `src/llm/gemini.ts` for a reference implementation.

### Shopping Tools
New tools that extend the agent's capabilities: wishlists, product reviews, returns, price alerts, coupon/discount application, inventory notifications.

### Reference Agents
Example agents built on top of the SDK that demonstrate real use cases: price comparison across merchants, product research assistant, deal finder, gift recommendation engine.

### Documentation
Tutorials, how-to guides, and examples. Especially useful: "Build your first shopping agent" tutorial, "Write a custom LLM adapter" guide, integration examples with popular frameworks.

### Bug Reports
File issues with clear reproduction steps. Edge cases in UCP profile parsing, timeout handling, and function calling conversion are especially valuable.

## Code of Conduct

Be respectful, constructive, and inclusive. We are building tools for developers -- keep discussions technical and focused on improving the project.

## Questions?

Open a [Discussion](https://github.com/agorio/agorio/discussions) on GitHub. For bug reports, use [Issues](https://github.com/agorio/agorio/issues).
