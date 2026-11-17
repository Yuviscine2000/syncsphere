import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.js'],
    restoreMocks: true,
    clearMocks: true,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
