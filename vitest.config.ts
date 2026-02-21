import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/lib/types.ts'],
      thresholds: {
        lines: 85,
        functions: 90,
        branches: 70,
        statements: 85,
        perFile: false,
      },
    },
  },
});
