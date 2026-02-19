# Reference Agents

Example agents demonstrating real-world use cases with the Agorio SDK.

All examples use `MockMerchant` and `MockAcpMerchant` — **no API keys needed**.

## Running

```bash
# Install dependencies (from repo root)
npm install

# Run any example
npx tsx examples/deal-finder.ts
npx tsx examples/price-comparison.ts
npx tsx examples/product-researcher.ts
```

## Examples

### Deal Finder

**File:** `deal-finder.ts`
**Demonstrates:** Multi-merchant discovery and price comparison

Discovers two UCP merchants, searches for a product across both, and compares prices to recommend the best deal.

```
Agent flow: discover → search → discover → search → compare
```

### Price Comparison (Dual Protocol)

**File:** `price-comparison.ts`
**Demonstrates:** UCP + ACP dual-protocol support

Searches for a product across a UCP merchant (Google/Shopify protocol) and an ACP merchant (OpenAI/Stripe protocol). The agent auto-detects which protocol each merchant uses.

```
Agent flow: discover UCP → search → discover ACP → search → compare
```

### Product Researcher (Streaming)

**File:** `product-researcher.ts`
**Demonstrates:** Streaming output with `runStream()`

Uses `runStream()` to provide real-time output as the agent browses a product catalog, collects details on multiple items, and produces a comparison report.

```
Agent flow: discover → browse → get_product (x4) → report
```

## Using a Real LLM

These examples use `ScriptedLlm` to run without API keys. To use a real LLM, replace the scripted LLM with any adapter:

```typescript
import { GeminiAdapter } from '@agorio/sdk';

const llm = new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY! });
```

Or with Claude:

```typescript
import { ClaudeAdapter } from '@agorio/sdk';

const llm = new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! });
```

Or with a local Ollama model (no API key needed):

```typescript
import { OllamaAdapter } from '@agorio/sdk';

const llm = new OllamaAdapter({ model: 'llama3.1' });
```

The agent will then make real decisions based on the LLM's reasoning instead of following a script.
