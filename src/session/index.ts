/**
 * Persistent-session primitives for ShoppingAgent.
 *
 *   const storage = new FileSessionStorage({ dir: './sessions' });
 *   const agent = new ShoppingAgent({ llm, sessionStorage: storage, sessionId: 'po-1234' });
 *   await agent.run('Order 100 chairs');   // if interrupted, restart same agent — it resumes
 */

export { MemorySessionStorage } from './memory-storage.js';
export { FileSessionStorage } from './file-storage.js';
export type { FileSessionStorageOptions } from './file-storage.js';
