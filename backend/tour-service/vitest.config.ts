import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globalSetup: ['__tests__/globalSetup.ts'],
    setupFiles: ['__tests__/setup.ts'],
    // Seat concurrency tests share one in-memory Mongo instance; run serially so
    // no two files race on the same collections (.rule/testing-rules.md).
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
