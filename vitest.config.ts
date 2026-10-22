import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/*.corpus.test.ts', '**/*.live.test.ts', '**/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
