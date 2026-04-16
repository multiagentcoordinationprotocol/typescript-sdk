import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Exclude pure type/barrel files — they skew the function percentage
      // without adding meaningful runtime paths to cover.
      exclude: ['src/types.ts', 'src/agent/types.ts', 'src/index.ts', 'src/agent/index.ts', 'src/projections.ts'],
      reporter: ['text', 'html', 'json-summary'],
      // Calibrated against the 2026-04 suite (lines 85.48, branches 90.81,
      // functions 73.61, statements 85.48). Floors are current - 2pp; raise
      // them when new tests land. CI gates on these via `npm run test:coverage`.
      thresholds: {
        lines: 83,
        branches: 88,
        functions: 70,
        statements: 83,
      },
    },
  },
});
