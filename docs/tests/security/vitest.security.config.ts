import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
// Rooted at tour-service, not the repo root, so Vite's module resolution
// finds `node_modules` (supertest, mongodb-memory-server, jsonwebtoken, …) —
// those are only installed per-service, never at the repo root.
const tourServiceRoot = path.join(repoRoot, 'backend', 'tour-service')

// `vitest/config`'s `defineConfig` is only a typed identity helper; it is not
// imported here because Node resolves a config file's `require`/`import`
// graph relative to the config file's own location, and this directory
// (`docs/tests/security/`) has no `node_modules` ancestor of its own — vitest
// itself is only installed under `backend/tour-service/node_modules` and
// `frontend/node_modules`. A plain object works identically at runtime.

/**
 * Standalone vitest config for the security agent's cross-cutting tests
 * (`docs/tests/security/**`). The security agent may only write under
 * `docs/tests/security/` and `docs/agent-reports/` (agents/security/CLAUDE.md
 * + `.claude/hooks/enforce-agent-boundaries.js`), so this config lives here
 * rather than editing `backend/tour-service/vitest.config.ts`'s `include`.
 *
 * Run from the repo root:
 *   npx vitest run --config docs/tests/security/vitest.security.config.ts
 */
export default {
  // No `root` override: default root is the invoking cwd (`backend/tour-service`,
  // per the run command below), identical to that service's own
  // `vitest.config.ts` — only `include` differs, so module resolution
  // (supertest, mongodb-memory-server, …) works exactly as it does there.
  //
  // Vitest's dependency-externalization step resolves a bare import from an
  // out-of-root test file as `root/<pkg>` instead of `root/node_modules/<pkg>`
  // (a known limitation for specs living outside the configured root). Since
  // this agent may not add `docs/tests/security/**` to
  // `backend/tour-service/vitest.config.ts`'s own `include` (write access is
  // restricted to `docs/tests/security/` and `docs/agent-reports/` —
  // agents/security/CLAUDE.md), the three packages this spec imports directly
  // are aliased straight to their resolved entry files instead.
  resolve: {
    alias: {
      supertest: path.join(tourServiceRoot, 'node_modules/supertest/index.js'),
      jsonwebtoken: path.join(tourServiceRoot, 'node_modules/jsonwebtoken/index.js'),
      mongoose: path.join(tourServiceRoot, 'node_modules/mongoose/index.js'),
      'mongodb-memory-server': path.join(
        tourServiceRoot,
        'node_modules/mongodb-memory-server/index.js',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['../../docs/tests/security/**/*.security.test.ts'],
    // Reuses tour-service's own Mongo bootstrap/teardown (one in-memory Mongo
    // for the whole run, collections wiped between tests) so
    // `seat-request-modal.security.test.ts` — which assumes that ambient
    // connection rather than opening its own — keeps working unmodified.
    globalSetup: [path.join(tourServiceRoot, '__tests__/globalSetup.ts')],
    setupFiles: [path.join(tourServiceRoot, '__tests__/setup.ts')],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
}
