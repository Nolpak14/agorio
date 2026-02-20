/**
 * agorio init — Scaffold a new agent project
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface InitOptions {
  directory: string;
  name?: string;
}

export async function init(options: InitOptions): Promise<void> {
  const dir = options.directory;
  const name = options.name ?? basename(dir === '.' ? process.cwd() : dir);

  if (dir !== '.' && existsSync(dir)) {
    console.error(`Error: directory "${dir}" already exists.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Scaffolding new agent project: ${name}`);

  // Create directory structure
  if (dir !== '.') {
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(join(dir, 'src'), { recursive: true });

  // package.json
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '0.1.0',
        type: 'module',
        scripts: {
          build: 'tsc',
          start: 'node dist/agent.js',
        },
        dependencies: {
          '@agorio/sdk': '^0.3.0',
        },
        devDependencies: {
          typescript: '^5.6.0',
          '@types/node': '^22.0.0',
        },
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          esModuleInterop: true,
          declaration: true,
        },
        include: ['src'],
      },
      null,
      2,
    ) + '\n',
  );

  // .gitignore
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.env\n');

  // .env.example
  writeFileSync(
    join(dir, '.env.example'),
    '# Add your LLM API key\nGEMINI_API_KEY=\n# ANTHROPIC_API_KEY=\n# OPENAI_API_KEY=\n',
  );

  // src/agent.ts — starter agent
  writeFileSync(
    join(dir, 'src', 'agent.ts'),
    `import { ShoppingAgent, GeminiAdapter, MockMerchant } from '@agorio/sdk';

async function main() {
  // Start a mock merchant for testing
  const merchant = new MockMerchant();
  await merchant.start();
  console.log(\`Mock merchant running at \${merchant.baseUrl}\`);

  // Create an agent (swap GeminiAdapter for ClaudeAdapter or OpenAIAdapter)
  const agent = new ShoppingAgent({
    llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY! }),
    verbose: true,
  });

  // Run a shopping task
  const result = await agent.run(
    \`Go to \${merchant.domain} and find me wireless headphones under $100\`
  );

  console.log('\\n--- Result ---');
  console.log(result.answer);

  if (result.checkout) {
    console.log(\`Order ID: \${result.checkout.orderId}\`);
  }

  await merchant.stop();
}

main().catch(console.error);
`,
  );

  console.log(`\nCreated:`);
  console.log(`  ${join(dir, 'package.json')}`);
  console.log(`  ${join(dir, 'tsconfig.json')}`);
  console.log(`  ${join(dir, '.gitignore')}`);
  console.log(`  ${join(dir, '.env.example')}`);
  console.log(`  ${join(dir, 'src', 'agent.ts')}`);
  console.log(`\nNext steps:`);
  if (dir !== '.') {
    console.log(`  cd ${dir}`);
  }
  console.log(`  npm install`);
  console.log(`  # Add your API key to .env`);
  console.log(`  npm run build && npm start`);
}
