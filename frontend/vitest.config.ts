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
  },
})
