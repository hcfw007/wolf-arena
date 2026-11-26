import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // 测试资源限制：限制并发 worker 数，避免多核机器内存打爆
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // cli/smoke 是进程入口，deepseek 是必须 mock 的在线适配层，均不参与覆盖率统计
      exclude: ['src/cli.ts', 'src/smoke.ts', 'src/providers/deepseek.ts'],
    },
  },
})
