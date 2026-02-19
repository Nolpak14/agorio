# Contributing to Agorio

Thanks for your interest in contributing to Agorio! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Getting Started

```bash
git clone https://github.com/Nolpak14/agorio.git
cd agorio
npm install
npm run build
npm test
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | TypeScript compilation (`tsc`) |
| `npm test` | Run all 113 tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type check without emitting (`tsc --noEmit`) |

## Project Structure

```
src/
  index.ts                    # Public API exports
  types/index.ts              # All TypeScript types
  client/
    ucp-client.ts             # UCP discovery + REST client
    acp-client.ts             # ACP checkout session client
  llm/
    gemini.ts                 # Google Gemini adapter
    claude.ts                 # Anthropic Claude adapter
    openai.ts                 # OpenAI GPT adapter
    tools.ts                  # 12 shopping tool definitions (JSON Schema)
    types.ts                  # LLM adapter interface
  agent/
    shopping-agent.ts         # Plan-act-observe loop (dual UCP/ACP)
  mock/
    mock-merchant.ts          # UCP-compliant Express test server
    mock-acp-merchant.ts      # ACP-compliant Express test server
    fixtures.ts               # Product catalog + UCP profile builder
tests/
  ucp-client.test.ts          # UCP client tests
  acp-client.test.ts          # ACP client + MockAcpMerchant tests
  acp-agent.test.ts           # Agent with ACP protocol tests
  mock-merchant.test.ts       # UCP mock merchant tests
  shopping-agent.test.ts      # Agent orchestration tests
  streaming.test.ts           # Streaming support tests
  claude-adapter.test.ts      # Claude adapter tests
  openai-adapter.test.ts      # OpenAI adapter tests
```

## How to Add a New LLM Adapter

The `LlmAdapter` interface is the key abstraction. Any LLM with function calling can be integrated.

### 1. Create the adapter file

Create `src/llm/your-provider.ts`:

```typescript
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
  LlmStreamChunk,
} from '../types/index.js';

export interface YourAdapterOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
}

export class YourAdapter implements LlmAdapter {
  readonly modelName: string;

  constructor(options: YourAdapterOptions) {
    this.modelName = options.model ?? 'default-model';
    // Initialize your SDK client here
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<LlmResponse> {
    // 1. Convert ChatMessage[] to your provider's message format
    // 2. Convert ToolDefinition[] to your provider's function calling format
    // 3. Make the API call
    // 4. Convert the response back to LlmResponse
  }

  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncIterable<LlmStreamChunk> {
    // Same conversion as chat(), but yield LlmStreamChunk events
    // as they arrive from the provider's streaming API
  }
}
```

### 2. Key types to understand

```typescript
// Input: messages use a role-based format
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;    // For tool result messages
  toolCalls?: ToolCall[];  // For assistant messages with tool calls
}

// Input: tools are JSON Schema definitions
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

// Output: the response from the LLM
interface LlmResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

// Output: streaming chunks (discriminated union)
type LlmStreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; argumentsDelta: string }
  | { type: 'tool_call_complete'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'done'; response: LlmResponse };
```

### 3. Important: toolCallId mapping

The `ShoppingAgent` sets `toolCallId` to the tool name (not the call ID from the LLM). Your adapter needs to handle this mapping when converting tool result messages back to provider format. See the existing adapters for reference -- they use a queue-based approach to resolve `name -> ID`.

### 4. Export from index.ts

Add your adapter and its options type to `src/index.ts`:

```typescript
export { YourAdapter } from './llm/your-provider.js';
export type { YourAdapterOptions } from './llm/your-provider.js';
```

### 5. Write tests

Create `tests/your-adapter.test.ts`. Mock the HTTP layer -- never make real API calls in tests. See `tests/claude-adapter.test.ts` for the pattern: it mocks the SDK client and tests message conversion, tool calling, streaming, and error handling.

## How to Add a New Shopping Tool

### 1. Add the tool definition

In `src/llm/tools.ts`, add to the `SHOPPING_AGENT_TOOLS` array:

```typescript
{
  name: 'your_tool_name',
  description: 'What this tool does (the LLM reads this to decide when to call it)',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description for the LLM' },
    },
    required: ['param1'],
  },
}
```

### 2. Add the handler

In `src/agent/shopping-agent.ts`, add a case in the `executeTool` method:

```typescript
case 'your_tool_name':
  return this.toolYourToolName(args as { param1: string });
```

Then implement the handler method on the `ShoppingAgent` class.

### 3. Write tests

Add test cases in `tests/shopping-agent.test.ts` using the `ScriptedLlm` mock -- script the LLM to call your tool and verify the output.

## Pull Request Process

1. **Fork and branch** -- Create a branch from `main` (`feature/`, `fix/`, `docs/`)
2. **Make changes** -- Keep commits focused and atomic
3. **Run all checks** -- `npm run build && npm test && npm run typecheck`
4. **Write tests** -- New features need tests. Bug fixes need regression tests.
5. **Open a PR** -- Describe what changed and why. Link related issues.

### Conventions

- **TypeScript** -- Strict mode, ES2022 target, ESM modules
- **Imports** -- Use `.js` extensions in import paths (ESM requirement)
- **Types** -- All types live in `src/types/index.ts`
- **Tests** -- Vitest, no real API calls (mock everything)
- **Naming** -- PascalCase for classes/types, camelCase for functions/variables, snake_case for tool names

## Areas Where Contributions Are Valuable

- **LLM adapters** -- Ollama, Mistral, Cohere, or any provider with function calling
- **Shopping tools** -- Wishlists, reviews, returns, price alerts, inventory checks
- **Reference agents** -- Example agents demonstrating real-world use cases
- **Bug fixes** -- Especially around UCP profile parsing and ACP checkout edge cases
- **Documentation** -- Tutorials, guides, API examples

## Questions?

Open a [GitHub Discussion](https://github.com/Nolpak14/agorio/discussions) or comment on the relevant issue.
