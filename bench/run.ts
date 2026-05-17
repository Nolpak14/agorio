/**
 * agorio benchmark harness.
 *
 * Designed to be runnable with `npx tsx bench/run.ts` — no API keys, no
 * network calls outside localhost MockMerchant. Each scenario emits a row to
 * stdout and the harness drops a `baseline-<sha>.json` next to this file.
 *
 * The bench intentionally uses a fully-stubbed LLM adapter so results reflect
 * SDK overhead, not provider latency.
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { MockMerchant } from '../src/mock/mock-merchant.js';
import { UcpClient } from '../src/client/ucp-client.js';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  LlmResponse,
} from '../src/types/index.js';

const WARMUP = 5;
const ITERS = 50;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Stub LLM ─────────────────────────────────────────────────────────────

interface StubScript {
  steps: Array<
    | { kind: 'tool'; tool: string; args: Record<string, unknown> }
    | { kind: 'final'; text: string }
  >;
}

class StubLlm implements LlmAdapter {
  readonly name = 'stub';
  private cursor = 0;
  private readonly script: StubScript;
  /** Synthetic token tally so the harness can report tokens-per-task. */
  public tokens = 0;

  constructor(script: StubScript) {
    this.script = script;
  }

  reset() {
    this.cursor = 0;
    this.tokens = 0;
  }

  async chat(messages: ChatMessage[], _tools: ToolDefinition[]): Promise<LlmResponse> {
    // Approximate token cost: 1 token per 4 chars of all message bodies.
    this.tokens += Math.ceil(
      messages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0) / 4
    );

    const step = this.script.steps[this.cursor++];
    if (!step) {
      return { content: 'done', toolCalls: [] };
    }
    if (step.kind === 'tool') {
      return {
        content: '',
        toolCalls: [{ id: `tc_${this.cursor}`, name: step.tool, arguments: step.args }],
      };
    }
    return { content: step.text, toolCalls: [] };
  }
}

// ─── Stats helpers ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

// ─── Scenarios ────────────────────────────────────────────────────────────

type Scenario = {
  name: string;
  setup: () => Promise<{ teardown: () => Promise<void>; run: () => Promise<number> }>;
};

async function makeMerchant(): Promise<MockMerchant> {
  const merchant = new MockMerchant({ port: 0 });
  await merchant.start();
  return merchant;
}

const scenarios: Scenario[] = [
  {
    name: 'ucp-discovery',
    setup: async () => {
      const merchant = await makeMerchant();
      const client = new UcpClient();
      return {
        async run() {
          const t0 = performance.now();
          await client.discover(merchant.domain);
          return performance.now() - t0;
        },
        async teardown() {
          await merchant.stop();
        },
      };
    },
  },
  {
    name: 'product-search',
    setup: async () => {
      const merchant = await makeMerchant();
      const client = new UcpClient();
      const discovery = await client.discover(merchant.domain);
      return {
        async run() {
          const t0 = performance.now();
          await client.searchProducts(discovery.profile, 'wireless headphones', 10);
          return performance.now() - t0;
        },
        async teardown() {
          await merchant.stop();
        },
      };
    },
  },
  {
    name: 'single-tool-call',
    setup: async () => {
      const merchant = await makeMerchant();
      const llm = new StubLlm({
        steps: [
          { kind: 'tool', tool: 'list_products', args: { merchant_domain: merchant.domain } },
          { kind: 'final', text: 'Listed products.' },
        ],
      });
      return {
        async run() {
          llm.reset();
          const agent = new ShoppingAgent({ llm });
          const t0 = performance.now();
          await agent.run(`List products on ${merchant.domain}`);
          return performance.now() - t0;
        },
        async teardown() {
          await merchant.stop();
        },
      };
    },
  },
  {
    name: 'full-checkout',
    setup: async () => {
      const merchant = await makeMerchant();
      const llm = new StubLlm({
        steps: [
          { kind: 'tool', tool: 'search_products', args: { merchant_domain: merchant.domain, query: 'headphones' } },
          { kind: 'tool', tool: 'add_to_cart', args: { merchant_domain: merchant.domain, product_id: 'prod_1', quantity: 1 } },
          { kind: 'tool', tool: 'view_cart', args: { merchant_domain: merchant.domain } },
          { kind: 'final', text: 'Cart has one item ready to check out.' },
        ],
      });
      return {
        async run() {
          llm.reset();
          const agent = new ShoppingAgent({ llm });
          const t0 = performance.now();
          await agent.run(`Add one pair of headphones to the cart on ${merchant.domain}`);
          return performance.now() - t0;
        },
        async teardown() {
          await merchant.stop();
        },
      };
    },
  },
];

// ─── Driver ───────────────────────────────────────────────────────────────

async function runScenario(scenario: Scenario) {
  const ctx = await scenario.setup();
  try {
    // Warmup
    for (let i = 0; i < WARMUP; i++) await ctx.run();

    const samples: number[] = [];
    for (let i = 0; i < ITERS; i++) {
      samples.push(await ctx.run());
    }
    return summarize(samples);
  } finally {
    await ctx.teardown();
  }
}

async function main() {
  const wantArg = process.argv.find(a => a.startsWith('--scenario='));
  const wanted = wantArg ? wantArg.split('=')[1] : null;

  const selected = wanted ? scenarios.filter(s => s.name === wanted) : scenarios;
  if (selected.length === 0) {
    console.error(`No scenario named "${wanted}". Available:`, scenarios.map(s => s.name).join(', '));
    process.exit(1);
  }

  console.log(`\nagorio bench — ${ITERS} iters (after ${WARMUP} warmup)\n`);
  console.log('| scenario | p50 (ms) | p95 (ms) | p99 (ms) | mean (ms) |');
  console.log('| -------- | -------- | -------- | -------- | --------- |');

  const results: Record<string, ReturnType<typeof summarize>> = {};
  for (const s of selected) {
    const stats = await runScenario(s);
    results[s.name] = stats;
    console.log(
      `| ${s.name.padEnd(18)} | ${stats.p50.toFixed(2).padStart(7)} | ${stats.p95
        .toFixed(2)
        .padStart(7)} | ${stats.p99.toFixed(2).padStart(7)} | ${stats.mean.toFixed(2).padStart(8)} |`
    );
  }

  let sha = 'local';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* keep "local" */
  }

  const outPath = join(__dirname, `baseline-${sha}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        sdkVersion: process.env.npm_package_version ?? 'workspace',
        commit: sha,
        timestamp: new Date().toISOString(),
        warmup: WARMUP,
        iterations: ITERS,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nBaseline written to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
