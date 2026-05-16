/**
 * File-based session storage. Persists one JSON file per session under a
 * configurable directory; writes are atomic (temp + rename).
 *
 *   const storage = new FileSessionStorage({ dir: './sessions' });
 *   await storage.save(state);
 *
 * Suitable for single-process dev / small deployments. For multi-process
 * or HA setups, use a backed store (Redis, Postgres, …).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { SessionState, SessionStorage } from '../types/index.js';

export interface FileSessionStorageOptions {
  /** Directory to store session files. Created on first save if missing. */
  dir: string;
}

export class FileSessionStorage implements SessionStorage {
  private readonly dir: string;
  private dirEnsured = false;

  constructor(options: FileSessionStorageOptions) {
    if (!options.dir) throw new Error('FileSessionStorage: `dir` is required');
    this.dir = path.resolve(options.dir);
  }

  async save(state: SessionState): Promise<void> {
    await this.ensureDir();
    const finalPath = this.pathFor(state.sessionId);
    const tmpPath = `${finalPath}.${randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmpPath, finalPath);
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const raw = await fs.readFile(this.pathFor(sessionId), 'utf8');
      return JSON.parse(raw) as SessionState;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async list(filter?: { customerId?: string; before?: Date }): Promise<SessionState[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir);
    const states: SessionState[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, f), 'utf8');
        const state = JSON.parse(raw) as SessionState;
        if (filter?.customerId && state.customerId !== filter.customerId) continue;
        if (filter?.before && new Date(state.savedAt) >= filter.before) continue;
        states.push(state);
      } catch {
        // Skip malformed files
      }
    }
    return states;
  }

  async delete(sessionId: string): Promise<void> {
    try {
      await fs.unlink(this.pathFor(sessionId));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.dirEnsured = true;
  }

  private pathFor(sessionId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      throw new Error(`FileSessionStorage: invalid sessionId "${sessionId}"`);
    }
    return path.join(this.dir, `${sessionId}.json`);
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
  );
}
