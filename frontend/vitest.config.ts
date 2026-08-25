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
  },
})
