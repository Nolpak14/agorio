import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 15_000,
    // Sub-packages have their own deps + own `npm test`. Don't try to run
    // them from the root suite — `npm ci` at the root doesn't populate
    // their node_modules so `@agorio/sdk` import resolution would fail.
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      'packages/**',
      'plugins/*/tests/**',
    ],
  },
});
