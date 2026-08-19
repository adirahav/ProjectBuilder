import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Tests run against jsdom with React Testing Library. The Tailwind plugin is
// deliberately absent here: tests assert behaviour and accessible markup, never
// computed styles, so compiling CSS would only slow the suite down.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
    // Threads, not the default forked processes: spawning a fork per test file
    // times out on this Windows setup before the worker ever reports in, which
    // fails the whole run for reasons that have nothing to do with the tests.
    pool: 'threads',
    // The multi-screen flow tests drive real user-event typing through jsdom,
    // which is comfortably slower than Vitest's 5s default on a loaded machine —
    // several were failing on the clock rather than on behaviour. Raised to keep
    // the suite deterministic (.rule/testing-rules.md, "no flaky tests").
    testTimeout: 20_000,
  },
})
