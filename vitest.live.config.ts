import { defineConfig } from 'vitest/config';

// The live test: the real gateway and LoginFlow against the real servers. See apps/client/test/lobby.live.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
