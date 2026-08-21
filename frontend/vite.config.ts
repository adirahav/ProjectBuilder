import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Stated explicitly rather than left to Vite's default: `backend/api-gateway`
    // serves this directory as static files in the single-origin production
    // deploy, so the path is now a contract between two packages and should not
    // silently move if a future Vite default changes.
    outDir: 'dist',
  },
})
