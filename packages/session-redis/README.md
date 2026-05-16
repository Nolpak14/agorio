# @agorio/session-redis

Redis-backed `SessionStorage` for the [Agorio SDK](https://www.npmjs.com/package/@agorio/sdk). Durable agent session persistence across process restarts.

```bash
npm install @agorio/sdk @agorio/session-redis ioredis
```

```ts
import Redis from 'ioredis';
import { ShoppingAgent } from '@agorio/sdk';
import { RedisSessionStorage } from '@agorio/session-redis';

const storage = new RedisSessionStorage({
  redis: new Redis(process.env.REDIS_URL!),
  keyPrefix: 'agorio:sessions:',
  ttlSeconds: 60 * 60 * 24 * 30, // 30-day expiry
});

const agent = new ShoppingAgent({
  llm,
  sessionStorage: storage,
  sessionId: 'po-1234',          // resumes from this session if it exists
  sessionCustomerId: 'cust-acme',
});

await agent.run('Order 100 ergonomic chairs from preferred vendors');
// If the process crashes mid-run, construct the same agent again — it picks
// up from the last persisted iteration.
```

## Why durable sessions?

Procurement agents pause for human approval. A `submit_payment` over $1k might wait hours for a reviewer to click "approve" — the agent must survive a process restart in that window. `RedisSessionStorage` is the production answer; `MemorySessionStorage` and `FileSessionStorage` (shipped in-tree with the SDK) are the dev / single-process answers.

## License

MIT
