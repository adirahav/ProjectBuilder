import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// A bare `dotenv.config()` only ever loads a file literally named `.env`. This
// project names its files per-environment instead, so the path is always
// explicit — otherwise every var below would silently fall back to its default
// with no error at all (backend-service-layer skill).
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const nodeEnv = process.env.NODE_ENV ?? 'development'
const envFile = path.join(serviceRoot, `.env.${nodeEnv}`)

if (existsSync(envFile)) {
  dotenv.config({ path: envFile })
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  // 4002 per the API contract's server default and .plan/011 step 9.
  // tour-service already owns 4001.
  port: Number(process.env.PORT ?? 4002),
  mongodbUri: required('MONGODB_URI', 'mongodb://localhost:27017/hila-tours'),
  // The shared cluster URI has no database path segment, so the database is
  // selected via mongoose's `dbName` option instead of being baked into the URI.
  dbName: process.env.DB_NAME ?? '',
  // This is the ONLY service that issues tokens; tour-service verifies them
  // independently with no runtime lookup between the two, so the value must be
  // byte-identical across both services (agents/backend/CLAUDE.md).
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  frontendOrigin: required('FRONTEND_ORIGIN', 'http://localhost:5173'),
  // bcrypt work factor. Kept low under NODE_ENV=test so the suite is not
  // dominated by deliberate key-stretching cost.
  bcryptRounds: nodeEnv === 'test' ? 4 : 12,
}
