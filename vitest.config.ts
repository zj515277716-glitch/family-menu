import { defineConfig } from 'vitest/config';

// 检测是否以 --coverage 模式运行，注入环境变量供测试代码动态调整阈值
const isCoverageRun = process.argv.includes('--coverage');

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.spec.ts', 'apps/*/test/**/*.spec.ts', 'tools/*/test/**/*.spec.ts'],
    env: {
      VITEST_COVERAGE: isCoverageRun ? '1' : '0',
    },
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
