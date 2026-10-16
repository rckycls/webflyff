import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.corpus.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 600000,
  },
});
