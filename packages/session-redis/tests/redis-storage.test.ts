/**
 * Tests for RedisSessionStorage. Uses an in-memory client implementing the
 * RedisClientLike surface so we don't need a real Redis instance in CI.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RedisSessionStorage, type RedisClientLike } from '../src/index.js';
import type { SessionState } from '@agorio/sdk';

class InMemoryRedis implements RedisClientLike {
  private kv = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  async get(key: string) {
    return this.kv.get(key) ?? null;
  }

  async set(key: string, value: string, ..._args: unknown[]) {
    this.kv.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.kv.delete(k)) n++;
    return n;
  }

  async keys(pattern: string) {
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...this.kv.keys()].filter(k => re.test(k));
  }

  async mget(...keys: string[]) {
    return keys.map(k => this.kv.get(k) ?? null);
  }

  async sadd(key: string, ...members: string[]) {
    const set = this.sets.get(key) ?? new Set();
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) { set.add(m); added++; }
    }
    this.sets.set(key, set);
    return added;
  }

  async srem(key: string, ...members: string[]) {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) if (set.delete(m)) removed++;
    return removed;
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? new Set())];
  }
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sess_a',
    task: 'order chairs',
    iteration: 1,
    messages: [{ role: 'user', content: 'go' }],
    merchants: [],
    activeMerchantDomain: null,
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RedisSessionStorage', () => {
  let redis: InMemoryRedis;
  let store: RedisSessionStorage;

  beforeEach(() => {
    redis = new InMemoryRedis();
    store = new RedisSessionStorage({ redis });
  });

  it('round-trips a session via SET / GET', async () => {
    await store.save(makeState());
    const loaded = await store.load('sess_a');
    expect(loaded?.task).toBe('order chairs');
  });

  it('indexes by customerId for filtered list()', async () => {
    await store.save(makeState({ sessionId: 'a', customerId: 'cust-1' }));
    await store.save(makeState({ sessionId: 'b', customerId: 'cust-2' }));
    await store.save(makeState({ sessionId: 'c', customerId: 'cust-1' }));

    const cust1 = await store.list({ customerId: 'cust-1' });
    expect(cust1.map(s => s.sessionId).sort()).toEqual(['a', 'c']);
  });

  it('delete removes both the doc and the customer-index entry', async () => {
    await store.save(makeState({ sessionId: 'a', customerId: 'cust-1' }));
    await store.delete('a');
    expect(await store.load('a')).toBeNull();
    expect(await redis.smembers('agorio:sessions:by_customer:cust-1')).toEqual([]);
  });

  it('list() without filters returns all sessions and ignores index keys', async () => {
    await store.save(makeState({ sessionId: 'a', customerId: 'cust-1' }));
    await store.save(makeState({ sessionId: 'b' }));

    const all = await store.list();
    expect(all.map(s => s.sessionId).sort()).toEqual(['a', 'b']);
  });
});
