import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 10_000,
  },
});
