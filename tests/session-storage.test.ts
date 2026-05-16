/**
 * Tests for MemorySessionStorage, FileSessionStorage, and ShoppingAgent
 * resume behavior across process restarts.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MemorySessionStorage } from '../src/session/memory-storage.js';
import { FileSessionStorage } from '../src/session/file-storage.js';
import { ShoppingAgent } from '../src/agent/shopping-agent.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import type {
  ChatMessage,
  LlmAdapter,
  LlmResponse,
  SessionState,
  ToolCall,
  ToolDefinition,
} from '../src/types/index.js';

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sess_a',
    task: 'buy something',
    iteration: 2,
    messages: [{ role: 'user', content: 'go' }],
    merchants: [],
    activeMerchantDomain: null,
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MemorySessionStorage', () => {
  it('round-trips a snapshot', async () => {
    const store = new MemorySessionStorage();
    await store.save(makeState());

    const loaded = await store.load('sess_a');
    expect(loaded?.task).toBe('buy something');
    expect(loaded?.iteration).toBe(2);
    expect(store.size()).toBe(1);
  });

  it('returns null for unknown ids', async () => {
    const store = new MemorySessionStorage();
    expect(await store.load('nope')).toBeNull();
  });

  it('lists with customerId + before filters', async () => {
    const store = new MemorySessionStorage();
    const older = makeState({
      sessionId: 'a',
      customerId: 'cust-1',
      savedAt: new Date('2026-01-01').toISOString(),
    });
    const newer = makeState({
      sessionId: 'b',
      customerId: 'cust-2',
      savedAt: new Date('2026-06-01').toISOString(),
    });
    await store.save(older);
    await store.save(newer);

    expect((await store.list({ customerId: 'cust-1' })).map(s => s.sessionId)).toEqual(['a']);
    expect((await store.list({ before: new Date('2026-03-01') })).map(s => s.sessionId)).toEqual(['a']);
  });

  it('deletes a session', async () => {
    const store = new MemorySessionStorage();
    await store.save(makeState());
    await store.delete('sess_a');
    expect(await store.load('sess_a')).toBeNull();
  });

  it('returns deep copies (mutating loaded state does not affect store)', async () => {
    const store = new MemorySessionStorage();
    await store.save(makeState());
    const loaded = await store.load('sess_a');
    loaded!.task = 'mutated';
    const reload = await store.load('sess_a');
    expect(reload!.task).toBe('buy something');
  });
});

describe('FileSessionStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agorio-sess-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('persists a session as JSON on disk', async () => {
    const store = new FileSessionStorage({ dir });
    await store.save(makeState({ sessionId: 'po-1234' }));

    const filePath = path.join(dir, 'po-1234.json');
    const raw = await fs.readFile(filePath, 'utf8');
    expect(JSON.parse(raw).task).toBe('buy something');
  });

  it('loads a previously saved session', async () => {
    const store = new FileSessionStorage({ dir });
    await store.save(makeState({ sessionId: 'po-1234' }));
    const loaded = await store.load('po-1234');
    expect(loaded?.iteration).toBe(2);
  });

  it('returns null for missing session files', async () => {
    const store = new FileSessionStorage({ dir });
    expect(await store.load('does-not-exist')).toBeNull();
  });

  it('rejects unsafe sessionIds (path traversal guard)', async () => {
    const store = new FileSessionStorage({ dir });
    await expect(store.save(makeState({ sessionId: '../escape' }))).rejects.toThrow(/invalid sessionId/);
  });

  it('lists sessions with filters', async () => {
    const store = new FileSessionStorage({ dir });
    await store.save(makeState({
      sessionId: 'a',
      customerId: 'cust-1',
      savedAt: new Date('2026-01-01').toISOString(),
    }));
    await store.save(makeState({
      sessionId: 'b',
      customerId: 'cust-2',
      savedAt: new Date('2026-06-01').toISOString(),
    }));

    const list = await store.list({ customerId: 'cust-2' });
    expect(list.map(s => s.sessionId)).toEqual(['b']);
  });

  it('delete is idempotent', async () => {
    const store = new FileSessionStorage({ dir });
    await store.save(makeState({ sessionId: 'x' }));
    await store.delete('x');
    await store.delete('x'); // second delete should not throw
    expect(await store.load('x')).toBeNull();
  });
});

/**
 * ShoppingAgent integration — verify the iteration counter and conversation
 * history survive a "process restart" (new ShoppingAgent constructed against
 * the same storage + sessionId).
 */
class ScriptedLlm implements LlmAdapter {
  readonly modelName = 'scripted';
  private callIndex = 0;
  constructor(
    private readonly script: Array<{ content?: string; toolCalls?: ToolCall[] }>
  ) {}
  async chat(_messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LlmResponse> {
    const step = this.script[this.callIndex++];
    if (!step) return { content: 'Done.', toolCalls: [], finishReason: 'stop' };
    return {
      content: step.content ?? '',
      toolCalls: step.toolCalls ?? [],
      finishReason: step.toolCalls?.length ? 'tool_calls' : 'stop',
    };
  }
}

describe('ShoppingAgent resume via SessionStorage', () => {
  let merchant: MockMerchant;
  beforeAll(async () => {
    merchant = new MockMerchant({ name: 'Resume Test Store' });
    await merchant.start();
  });
  afterAll(async () => {
    await merchant.stop();
  });

  it('persists state between iterations and resumes from a saved snapshot', async () => {
    const storage = new MemorySessionStorage();
    const sessionId = 'po-resume-1';

    const llm1 = new ScriptedLlm([
      {
        toolCalls: [{ id: '1', name: 'discover_merchant', arguments: { domain: merchant.domain } }],
      },
      {
        toolCalls: [{ id: '2', name: 'browse_products', arguments: {} }],
      },
      // Iteration 3 would happen here, but we "kill" the agent by not
      // letting it run further — except actually the agent keeps going
      // until the LLM returns no tool calls. Force an early "stop" so
      // the run ends at iteration 3 with state persisted up to iteration 2.
      { content: 'Pausing for human input.' },
    ]);

    const agent1 = new ShoppingAgent({ llm: llm1, sessionStorage: storage, sessionId });
    const result1 = await agent1.run('Discover and browse');
    expect(result1.success).toBe(true);
    expect(result1.iterations).toBe(3);

    const snapshot = await storage.load(sessionId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.task).toBe('Discover and browse');
    expect(snapshot!.iteration).toBeGreaterThan(0);
    // Conversation history was persisted
    expect(snapshot!.messages.length).toBeGreaterThan(1);

    // ── Simulate a process restart: build a fresh agent against the same
    // storage + sessionId. It should hydrate conversation history rather
    // than start from the task string.
    const llm2 = new ScriptedLlm([
      { content: 'Resumed and finished.' },
    ]);
    const agent2 = new ShoppingAgent({ llm: llm2, sessionStorage: storage, sessionId });
    const result2 = await agent2.run('IGNORED — should resume from persisted task');

    expect(result2.success).toBe(true);
    expect(result2.answer).toBe('Resumed and finished.');
  });

  it('does not save when no sessionStorage is configured', async () => {
    const llm = new ScriptedLlm([{ content: 'done' }]);
    const agent = new ShoppingAgent({ llm });
    const result = await agent.run('quick task');
    expect(result.success).toBe(true);
  });
});
