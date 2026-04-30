import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface PluginCommandOptions {
  subcommand: string;
  pluginName?: string;
}

function resolveNodeModules(): string {
  return join(process.cwd(), 'node_modules', '@agorio');
}

function normalizePluginName(name: string): string {
  if (name.startsWith('@agorio/plugin-')) return name;
  if (name.startsWith('@agorio/')) return name;
  return `@agorio/plugin-${name}`;
}

function shortName(fullName: string): string {
  return fullName.replace('@agorio/plugin-', '');
}

interface PluginPackageInfo {
  name: string;
  version: string;
  description?: string;
  license?: string;
  peerDependencies?: Record<string, string>;
}

function readPluginPackageJson(pluginDir: string): PluginPackageInfo | null {
  const pkgPath = join(pluginDir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

async function pluginList(): Promise<void> {
  const agorioDir = resolveNodeModules();

  if (!existsSync(agorioDir)) {
    console.log('No @agorio plugins installed.');
    return;
  }

  let entries: string[];
  try {
    entries = readdirSync(agorioDir).filter(e => e.startsWith('plugin-'));
  } catch {
    console.log('No @agorio plugins installed.');
    return;
  }

  if (entries.length === 0) {
    console.log('No @agorio plugins installed.');
    return;
  }

  console.log(`\nInstalled @agorio plugins:\n`);

  for (const entry of entries.sort()) {
    const dir = join(agorioDir, entry);
    const pkg = readPluginPackageJson(dir);
    if (!pkg) continue;

    const name = pkg.name ?? `@agorio/${entry}`;
    const version = pkg.version ?? '?';
    const desc = pkg.description ?? '';
    console.log(`  ${name}  v${version}`);
    if (desc) console.log(`    ${desc}`);
    console.log('');
  }
}

async function pluginInstall(name: string): Promise<void> {
  const fullName = normalizePluginName(name);
  console.log(`Installing ${fullName}...`);
  try {
    execSync(`npm install ${fullName}`, { stdio: 'inherit' });
    console.log(`\nInstalled ${fullName} successfully.`);
  } catch {
    console.error(`Failed to install ${fullName}.`);
    process.exitCode = 1;
  }
}

async function pluginInfo(name: string): Promise<void> {
  const fullName = normalizePluginName(name);
  const dirName = fullName.replace('@agorio/', '');
  const pluginDir = join(resolveNodeModules(), dirName);

  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${fullName} is not installed.`);
    console.error(`\nInstall it with: agorio plugin install ${shortName(fullName)}`);
    process.exitCode = 1;
    return;
  }

  const pkg = readPluginPackageJson(pluginDir);
  if (!pkg) {
    console.error(`Could not read package.json for ${fullName}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${pkg.name ?? fullName}`);
  console.log(`${'─'.repeat((pkg.name ?? fullName).length)}`);
  console.log(`  Version:      ${pkg.version ?? 'unknown'}`);
  if (pkg.description) console.log(`  Description:  ${pkg.description}`);
  if (pkg.license) console.log(`  License:      ${pkg.license}`);
  if (pkg.peerDependencies) {
    const peers = Object.entries(pkg.peerDependencies)
      .map(([k, v]) => `${k}@${v}`)
      .join(', ');
    console.log(`  Peer deps:    ${peers}`);
  }
  console.log('');
}

export async function pluginCommand(options: PluginCommandOptions): Promise<void> {
  switch (options.subcommand) {
    case 'list':
      await pluginList();
      break;

    case 'install':
      if (!options.pluginName) {
        console.error('Usage: agorio plugin install <name>\n\nExample: agorio plugin install spending-controls');
        process.exitCode = 1;
        return;
      }
      await pluginInstall(options.pluginName);
      break;

    case 'info':
      if (!options.pluginName) {
        console.error('Usage: agorio plugin info <name>\n\nExample: agorio plugin info spending-controls');
        process.exitCode = 1;
        return;
      }
      await pluginInfo(options.pluginName);
      break;

    default:
      console.error(
        options.subcommand
          ? `Unknown plugin subcommand: ${options.subcommand}`
          : 'Usage: agorio plugin <list|install|info> [name]'
      );
      process.exitCode = 1;
  }
}
