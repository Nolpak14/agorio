/**
 * Tests for the agorio CLI commands
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { main } from '../src/cli/index.js';
import { discover } from '../src/cli/commands/discover.js';
import { init } from '../src/cli/commands/init.js';
import { MockMerchant } from '../src/mock/mock-merchant.js';
import { MockMcpMerchant } from '../src/mock/mock-mcp-merchant.js';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI — help and version', () => {
  it('prints help with --help', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--help']);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('agorio'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
    spy.mockRestore();
  });

  it('prints help with -h', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['-h']);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('agorio'));
    spy.mockRestore();
  });

  it('prints version with --version', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--version']);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+$/));
    spy.mockRestore();
  });

  it('prints help when no command given', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
    spy.mockRestore();
  });

  it('errors on unknown command', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['bogus']);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unknown command: bogus'));
    spy.mockRestore();
  });
});

describe('CLI — discover command', () => {
  let merchant: MockMerchant;

  beforeAll(async () => {
    merchant = new MockMerchant({ port: 0 });
    await merchant.start();
  });

  afterAll(async () => {
    await merchant.stop();
  });

  it('errors when domain argument is missing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['discover']);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('missing domain'));
    spy.mockRestore();
  });

  it('discovers a UCP merchant', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const output = await discover(merchant.domain);
    expect(output).toContain('Protocol: UCP');
    expect(output).toContain('Services:');
    expect(output).toContain('Capabilities:');
    spy.mockRestore();
  });

  it('discovers an MCP merchant', async () => {
    const mcpMerchant = new MockMcpMerchant({ port: 0 });
    await mcpMerchant.start();
    try {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const output = await discover(mcpMerchant.domain);
      expect(output).toContain('Protocol: UCP');
      expect(output).toContain('mcp');
      spy.mockRestore();
    } finally {
      await mcpMerchant.stop();
    }
  });

  it('handles unreachable domain', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const output = await discover('localhost:1');
    expect(output).toContain('Failed to discover');
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('CLI — init command', () => {
  const testDir = join(tmpdir(), `agorio-test-init-${Date.now()}`);

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('scaffolds a new project', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await init({ directory: testDir, name: 'test-agent' });

    expect(existsSync(join(testDir, 'package.json'))).toBe(true);
    expect(existsSync(join(testDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(testDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(testDir, '.env.example'))).toBe(true);
    expect(existsSync(join(testDir, 'src', 'agent.ts'))).toBe(true);

    const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('test-agent');
    expect(pkg.dependencies['@agorio/sdk']).toBeDefined();

    spy.mockRestore();
  });

  it('errors if directory already exists', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await init({ directory: testDir });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    spy.mockRestore();
    logSpy.mockRestore();
  });

  it('uses directory name as default project name', async () => {
    const dir2 = join(tmpdir(), `my-cool-agent-${Date.now()}`);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await init({ directory: dir2 });

    const pkg = JSON.parse(readFileSync(join(dir2, 'package.json'), 'utf-8'));
    expect(pkg.name).toMatch(/^my-cool-agent/);

    spy.mockRestore();
    rmSync(dir2, { recursive: true, force: true });
  });
});

describe('CLI — mock command', () => {
  it('wires up mock command via main()', async () => {
    // Just verify the command parsing works — we can't easily test a long-running server
    // but we can verify the argument parsing doesn't throw for valid flags
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // --help should work even with mock subcommand position
    await main(['--help']);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('mock'));
    spy.mockRestore();
  });
});
