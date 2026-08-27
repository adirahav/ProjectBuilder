import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
// Rooted at user-management-service, not the repo root, so Vite's module
// resolution finds `node_modules` (supertest, mongodb-memory-server,
// jsonwebtoken, bcryptjs, …) — those are only installed per-service, never at
// the repo root.
const userManagementServiceRoot = path.join(repoRoot, 'backend', 'user-management-service')

/**
 * Standalone vitest config for the security agent's cross-cutting tests
 * against `backend/user-management-service`
 * (`docs/tests/security/scaffold-sec-signup.security.test.ts`). The security
 * agent may only write under `docs/tests/security/` and `docs/agent-reports/`
 * (agents/security/CLAUDE.md + `.claude/hooks/enforce-agent-boundaries.js`),
 * so this config lives here rather than editing
 * `backend/user-management-service/vitest.config.ts`'s `include` — mirrors
 * `docs/tests/security/vitest.security.config.ts`'s pattern for tour-service.
 *
 * Run from the repo root:
 *   npx vitest run --config docs/tests/security/vitest.security.user-management.config.ts
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
    // Same env values as backend/user-management-service/vitest.config.ts's
    // own `test.env` block — `api/lib/config.ts` reads `process.env` at
    // import time, so this must be a test-config-level env, not a setup file.
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
