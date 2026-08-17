import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const nodeEnv = process.env.NODE_ENV ?? 'development'

// This repo's convention is `.env.<NODE_ENV>` (e.g. `.env.development`),
// with a plain `.env` as fallback. Load the env-specific file first —
// dotenv never overwrites an already-set variable, so the more specific
// file wins and real process env still takes precedence over both.
for (const file of [`.env.${nodeEnv}`, '.env']) {
	const path = resolve(serviceRoot, file)
	if (existsSync(path)) {
		dotenv.config({ path })
	}
}

function required(name: string): string {
	const value = process.env[name]
	if (!value || value.trim() === '') {
		throw new Error(`[env] Missing required environment variable: ${name}`)
	}
	return value
}

function optional(name: string, fallback: string): string {
	const value = process.env[name]
	return value && value.trim() !== '' ? value : fallback
}

export const env = {
	nodeEnv,
	port: Number(optional('PORT', '4001')),
	mongodbUri: required('MONGODB_URI'),
	jwtSecret: required('JWT_SECRET'),
	jwtExpiresIn: optional('JWT_EXPIRES_IN', '1d'),
	frontendOrigin: optional('FRONTEND_ORIGIN', 'http://localhost:5173')
}

export type Env = typeof env
