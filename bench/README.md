# agorio benchmarks

Reproducible micro-benchmarks for `@agorio/sdk` v0.8+. Designed to give procurement
teams and contributors a baseline for **agent latency**, **tokens-per-task**, and
**SDK overhead** independent of any specific LLM provider.

## Running

```bash
# Full benchmark suite (uses MockMerchant + a stubbed LLM — no API keys required)
npx tsx bench/run.ts

# Specific scenario
npx tsx bench/run.ts --scenario=ucp-discovery
```

Output is a markdown table plus a `bench/baseline-<commit-sha>.json` file you can
commit alongside performance-affecting PRs.

## What is measured

| Scenario            | What it stresses                                  |
| ------------------- | ------------------------------------------------- |
| `ucp-discovery`     | UcpClient cold discover() against MockMerchant    |
| `product-search`    | One search → list 10 products                     |
| `single-tool-call`  | Agent makes exactly one tool call and answers     |
| `full-checkout`     | Full plan-act-observe loop ending in a checkout   |
| `sub-agent-chain`   | AgentChain with 2 sub-agents (v0.7+ primitive)    |

Each scenario runs 50 iterations after a 5-iteration warmup. We report p50, p95,
p99 latency, and (where applicable) tokens consumed by the stubbed LLM responses.

## What is NOT measured

- Real provider latency — that depends on the model and your network.
- Cloud ingestion latency — the bench skips the cloud trace path.
- Throughput under concurrency — the bench is single-threaded by design.

## Baseline (committed)

See `baseline-v0.8.0.json` for the reference numbers. Aim for parity or improvement
when shipping changes to the agent core.
