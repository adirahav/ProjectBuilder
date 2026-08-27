import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Set here rather than in a setup file: `api/lib/config.ts` reads
    // process.env at import time, so anything assigned later would be too late.
    // NODE_ENV=test also drops the bcrypt work factor so the suite is not
    // dominated by deliberate key-stretching cost. This secret is test-only and
    // is never the deployed value.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-jwt-secret-not-a-real-credential',
      JWT_EXPIRES_IN: '12h',
      FRONTEND_ORIGIN: 'http://localhost:5173',
    },
    include: ['__tests__/**/*.test.ts'],
    globalSetup: ['__tests__/globalSetup.ts'],
    setupFiles: ['__tests__/setup.ts'],
    // All test files share one in-memory Mongo instance; run serially so no two
    // files race on the same `admins` collection (.rule/testing-rules.md).
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
