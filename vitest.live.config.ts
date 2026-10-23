import { defineConfig } from 'vitest/config';

// The live tests: the real gateway, LoginFlow and WorldSession against the real servers. See apps/client/test/lobby.live.test.ts
// and world.live.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // One file at a time: each starts a gateway on gateway.listen.port, and the servers' flood limiter counts the
    // connections of both together.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
