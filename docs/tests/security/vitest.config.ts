import { defineConfig } from 'vitest/config'

/**
 * Standalone vitest config for repo-level security tests
 * (docs/tests/security/). These tests audit source files statically (no app
 * bootstrap required), so a plain Node environment is enough — no jsdom, no
 * frontend build pipeline.
 *
 * There is no root-level `vitest` install in this repo (only
 * `frontend/node_modules`), so this config cannot be invoked directly from
 * the repo root with a bare `npx vitest`. Run it via the frontend's installed
 * vitest binary instead, from `frontend/`, with a local include override
 * pointing at `../docs/tests/security` (this is how the suite was verified
 * during review — see the GATEWAYL-SEC security report for the exact
 * commands used).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.security.test.ts'],
    root: '.',
  },
})
