import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Test config, kept separate from vite.config.ts so the production build never
 * pulls in test-only settings. Tailwind is not loaded here — component tests
 * assert behavior and accessibility, not computed styles.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    /**
     * Vitest's 5s default is measured per test, but it starts ticking while the
     * forked worker is still booting its own jsdom environment. When the whole
     * suite runs in parallel those boots contend, and a user-event-driven test
     * that finishes in ~1s on its own can blow the budget purely on startup —
     * failing on machine load rather than on behavior. These ceilings only bound
     * how long a genuine hang is allowed to run; they weaken no assertion.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /**
     * Same contention, one level down. The timeouts above bound a test once its
     * worker is alive, but the pool has its own deadline for a forked worker to
     * finish booting and respond. Letting Vitest spawn one fork per core makes
     * every fork boot a jsdom environment simultaneously; on a loaded machine
     * enough of them miss that deadline that the run dies with
     * "Timeout waiting for worker to respond" before a single assertion runs.
     *
     * This was capped at 2, which held until plan 009 added the admin-dashboard
     * suite: at 13 test files, two concurrent jsdom boots were again enough to
     * miss the deadline and report worker-start errors alongside a fully passing
     * run. Serialising the pool removes the contention entirely. It costs little
     * — the run is dominated by per-file jsdom setup, which happens once per file
     * either way — and it buys a deterministic suite, which .rule/testing-rules.md
     * ("no flaky tests in mainline branches") values more than wall-clock time.
     */
    maxWorkers: 1,
  },
})
