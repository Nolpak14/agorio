/**
 * In-memory session storage — dev / test only. Loses data on process exit.
 */

import type { SessionState, SessionStorage } from '../types/index.js';

export class MemorySessionStorage implements SessionStorage {
  private readonly store = new Map<string, SessionState>();

  async save(state: SessionState): Promise<void> {
    this.store.set(state.sessionId, structuredClone(state));
  }

  async load(sessionId: string): Promise<SessionState | null> {
    const found = this.store.get(sessionId);
    return found ? structuredClone(found) : null;
  }

  async list(filter?: { customerId?: string; before?: Date }): Promise<SessionState[]> {
    const all = [...this.store.values()];
    return all.filter((s) => {
      if (filter?.customerId && s.customerId !== filter.customerId) return false;
      if (filter?.before && new Date(s.savedAt) >= filter.before) return false;
      return true;
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  /** Test helper — number of sessions currently stored. */
  size(): number {
    return this.store.size;
  }
}
