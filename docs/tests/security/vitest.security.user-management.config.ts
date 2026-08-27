import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const userManagementServiceRoot = path.join(repoRoot, 'backend', 'user-management-service')

/**
 * Standalone vitest config for the security agent's cross-cutting tests
 * against `backend/user-management-service`
 * (`docs/tests/security/scaffold-sec-signup.security.test.ts`). Mirrors
 * `docs/tests/security/vitest.security.config.ts`'s pattern for tour-service.
 *
 * Run from `backend/user-management-service`:
 *   npx vitest run --config ../../docs/tests/security/vitest.security.user-management.config.ts
 */
export default {
  resolve: {
    alias: {
      supertest: path.join(userManagementServiceRoot, 'node_modules/supertest/index.js'),
      jsonwebtoken: path.join(userManagementServiceRoot, 'node_modules/jsonwebtoken/index.js'),
      mongoose: path.join(userManagementServiceRoot, 'node_modules/mongoose/index.js'),
      'mongodb-memory-server': path.join(
        userManagementServiceRoot,
        'node_modules/mongodb-memory-server/index.js',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['../../docs/tests/security/scaffold-sec-signup.security.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-jwt-secret-not-a-real-credential',
      JWT_EXPIRES_IN: '12h',
      FRONTEND_ORIGIN: 'http://localhost:5173',
    },
    globalSetup: [path.join(userManagementServiceRoot, '__tests__/globalSetup.ts')],
    setupFiles: [path.join(userManagementServiceRoot, '__tests__/setup.ts')],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
}
