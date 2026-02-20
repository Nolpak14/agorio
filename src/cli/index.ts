#!/usr/bin/env node

/**
 * Agorio CLI — Developer tool for building and testing AI commerce agents
 *
 * Commands:
 *   agorio mock [--acp] [--port <n>]    Start a mock merchant server
 *   agorio discover <domain>             Discover a merchant's protocol and capabilities
 *   agorio init [directory]              Scaffold a new agent project
 *   agorio --help                        Show help text
 *   agorio --version                     Show version
 */

import { mock } from './commands/mock.js';
import { discover } from './commands/discover.js';
import { init } from './commands/init.js';

const VERSION = '0.3.1';

const HELP = `
agorio — CLI for AI commerce agent development

Usage:
  agorio <command> [options]

Commands:
  mock [options]        Start a mock merchant server for testing
    --acp              Start an ACP merchant instead of UCP
    --mcp              Start an MCP merchant instead of UCP
    --port <n>         Port to listen on (default: 3456)
    --name <name>      Merchant name (default: "Agorio Mock Merchant")

  discover <domain>    Discover a merchant's protocol and capabilities

  init [directory]     Scaffold a new agent project
    --name <name>      Project name (default: directory name)

Flags:
  --help, -h           Show this help text
  --version, -v        Show version

Examples:
  agorio mock                         Start UCP mock merchant on port 3456
  agorio mock --acp --port 4000       Start ACP mock on port 4000
  agorio discover localhost:3456      Discover a local merchant
  agorio init my-agent                Scaffold a new project in ./my-agent
`.trim();

function parseArgs(argv: string[]): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      flags[key] = true;
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return {
    command: positional[0] ?? '',
    args: positional.slice(1),
    flags,
  };
}

export async function main(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv);

  if (flags.help || flags.h) {
    console.log(HELP);
    return;
  }

  if (flags.version || flags.v) {
    console.log(VERSION);
    return;
  }

  switch (command) {
    case 'mock':
      await mock({
        acp: flags.acp === true,
        mcp: flags.mcp === true,
        port: typeof flags.port === 'string' ? parseInt(flags.port, 10) : 3456,
        name: typeof flags.name === 'string' ? flags.name : undefined,
      });
      break;

    case 'discover':
      if (!args[0]) {
        console.error('Error: missing domain argument.\n\nUsage: agorio discover <domain>');
        process.exitCode = 1;
        return;
      }
      await discover(args[0]);
      break;

    case 'init':
      await init({
        directory: args[0] ?? '.',
        name: typeof flags.name === 'string' ? flags.name : undefined,
      });
      break;

    case '':
      console.log(HELP);
      break;

    default:
      console.error(`Unknown command: ${command}\n\nRun "agorio --help" for usage.`);
      process.exitCode = 1;
  }
}

// Run when executed directly
const cliArgs = process.argv.slice(2);
main(cliArgs).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
