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
     * Capping the pool keeps the suite green and, because the forks no longer
     * starve each other during startup, it also finishes faster than the
     * uncapped default. Raise this only if the suite grows enough to need it.
     */
    maxWorkers: 2,
  },
})
