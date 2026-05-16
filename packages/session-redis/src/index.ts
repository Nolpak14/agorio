/**
 * @agorio/session-redis — Redis-backed SessionStorage.
 *
 *   import Redis from 'ioredis';
 *   import { RedisSessionStorage } from '@agorio/session-redis';
 *
 *   const storage = new RedisSessionStorage({
 *     redis: new Redis(process.env.REDIS_URL!),
 *     keyPrefix: 'agorio:sessions:',
 *     ttlSeconds: 60 * 60 * 24 * 30, // 30 days
 *   });
 *
 *   const agent = new ShoppingAgent({ llm, sessionStorage: storage, sessionId: 'po-1234' });
 *
 * The storage layout is one HSET-style JSON document per session, plus
 * a secondary index `<prefix>by_customer:<customerId>` (a SET of session IDs)
 * for filtered list() queries.
 */

import type { SessionState, SessionStorage } from '@agorio/sdk';

/** Minimal Redis client surface — ioredis and node-redis v4 both satisfy this. */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  mget(...keys: string[]): Promise<Array<string | null>>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  expire?(key: string, seconds: number): Promise<number>;
}

export interface RedisSessionStorageOptions {
  redis: RedisClientLike;
  /** Key prefix for session documents. Default: `agorio:sessions:`. */
  keyPrefix?: string;
  /** Optional per-session TTL in seconds. Omit for no expiry. */
  ttlSeconds?: number;
}

export class RedisSessionStorage implements SessionStorage {
  private readonly redis: RedisClientLike;
  private readonly keyPrefix: string;
  private readonly ttlSeconds?: number;

  constructor(options: RedisSessionStorageOptions) {
    if (!options.redis) throw new Error('RedisSessionStorage: `redis` client is required');
    this.redis = options.redis;
    this.keyPrefix = options.keyPrefix ?? 'agorio:sessions:';
    this.ttlSeconds = options.ttlSeconds;
  }

  async save(state: SessionState): Promise<void> {
    const key = this.sessionKey(state.sessionId);
    const json = JSON.stringify(state);
    if (this.ttlSeconds && this.ttlSeconds > 0) {
      await this.redis.set(key, json, 'EX', this.ttlSeconds);
    } else {
      await this.redis.set(key, json);
    }
    if (state.customerId) {
      await this.redis.sadd(this.customerIndexKey(state.customerId), state.sessionId);
    }
  }

  async load(sessionId: string): Promise<SessionState | null> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  }

  async list(filter?: { customerId?: string; before?: Date }): Promise<SessionState[]> {
    let sessionIds: string[];
    if (filter?.customerId) {
      sessionIds = await this.redis.smembers(this.customerIndexKey(filter.customerId));
    } else {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const indexPrefix = `${this.keyPrefix}by_customer:`;
      sessionIds = keys
        .filter(k => !k.startsWith(indexPrefix))
        .map(k => k.slice(this.keyPrefix.length));
    }

    if (sessionIds.length === 0) return [];

    const docs = await this.redis.mget(
      ...sessionIds.map(id => this.sessionKey(id))
    );

    const states: SessionState[] = [];
    for (const doc of docs) {
      if (!doc) continue;
      const state = JSON.parse(doc) as SessionState;
      if (filter?.before && new Date(state.savedAt) >= filter.before) continue;
      states.push(state);
    }
    return states;
  }

  async delete(sessionId: string): Promise<void> {
    const existing = await this.load(sessionId);
    await this.redis.del(this.sessionKey(sessionId));
    if (existing?.customerId) {
      await this.redis.srem(this.customerIndexKey(existing.customerId), sessionId);
    }
  }

  private sessionKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private customerIndexKey(customerId: string): string {
    return `${this.keyPrefix}by_customer:${customerId}`;
  }
}
