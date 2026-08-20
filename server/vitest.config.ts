import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: process.env.RUN_INTEGRATION === '1' ? [] : ['test/integration.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
