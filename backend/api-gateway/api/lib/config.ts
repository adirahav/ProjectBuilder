import 'dotenv/config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

// api/lib -> api -> api-gateway -> backend -> repo root -> frontend/dist
const defaultFrontendDistPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../frontend/dist',
)

const frontendDistPath = process.env.FRONTEND_DIST_PATH
  ? path.resolve(process.env.FRONTEND_DIST_PATH)
  : defaultFrontendDistPath

// Single-origin deploy: the gateway serves the built SPA alongside the API.
// Explicit SERVE_FRONTEND wins; otherwise auto-detect, so local dev (Vite dev
// server, no build run) is unaffected and a missing dist can never crash boot.
function resolveServeFrontend(): boolean {
  const flag = process.env.SERVE_FRONTEND
  if (flag !== undefined && flag !== '') return flag.toLowerCase() === 'true'
  return existsSync(path.join(frontendDistPath, 'index.html'))
}

// api-gateway is stateless: no MONGODB_URI, and it never issues tokens.
// It only verifies them (JWT_SECRET must be identical to user-service's),
// and needs the internal URLs of the services it will proxy to.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: required('FRONTEND_ORIGIN', 'http://localhost:5173'),
  jwtSecret: process.env.JWT_SECRET ?? '',
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL ?? 'http://localhost:4001',
  userServiceUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:4002',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:4003',
  serveFrontend: resolveServeFrontend(),
  frontendDistPath,
}
