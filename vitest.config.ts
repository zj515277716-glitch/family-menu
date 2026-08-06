import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.spec.ts', 'apps/*/test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**/*.ts', 'packages/list-merger/src/**/*.ts'],
      exclude: ['**/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
