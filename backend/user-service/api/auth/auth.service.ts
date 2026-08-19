import bcrypt from 'bcryptjs'

import { Admin } from '../models/admin.model.ts'
import { signAuthToken } from '../lib/jwt.ts'

export interface LoginCredentials {
  identifier?: unknown
  password?: unknown
}

export interface PublicAdmin {
  id: string
  email: string
}

export interface LoginResult {
  token: string
  admin: PublicAdmin
}

/**
 * A real bcrypt hash of a throwaway string. When no Admin matches the
 * submitted identifier we still run a full bcrypt comparison against this,
 * so the "unknown account" path costs the same wall-clock time as the "wrong
 * password" path. Without it, response timing alone reveals whether an
 * account exists — which is the exact enumeration leak the contract's
 * identical-401 requirement exists to prevent.
 */
const TIMING_EQUALIZER_HASH = '$2a$10$T6wLSHP2XOR6AtkpQTETa.aAAAkkv8GFjTzoLTG0shvx2QncAOXNG'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials')
    this.name = 'InvalidCredentialsError'
  }
}

/**
 * Normalize the login identifier. PRD Screen 5 allows an email OR a username
 * on this one field, so we must NOT enforce an email format here — we simply
 * trim and lowercase and match it against the Admin's `email`.
 *
 * The password is deliberately NOT trimmed: leading/trailing spaces are
 * legitimate password characters, and silently stripping them would reject
 * a correct password.
 */
function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase()
}

export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  const { identifier, password } = credentials

  // 400 territory: the request was never a well-formed login attempt, so no
  // credential check happens at all. Kept distinct from the 401 below.
  if (typeof identifier !== 'string' || identifier.trim().length === 0) {
    throw new ValidationError('Identifier and password are required')
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new ValidationError('Identifier and password are required')
  }
  if (identifier.length > 254) {
    throw new ValidationError('Identifier and password are required')
  }

  // Only the one field the route expects is ever put into the filter — never
  // a spread of req.body, which would be a NoSQL-injection vector.
  const admin = await Admin.findOne({ email: normalizeIdentifier(identifier) })

  const matches = await bcrypt.compare(
    password,
    admin ? String(admin.passwordHash) : TIMING_EQUALIZER_HASH,
  )

  // Unknown identifier and wrong password are collapsed into one error on
  // purpose: the caller must not be able to tell them apart.
  if (!admin || !matches) {
    throw new InvalidCredentialsError()
  }

  const token = signAuthToken({ userId: String(admin.uuid), roles: ['admin'] })

  // Built by hand rather than returned as the raw document, so the response
  // shape is explicit: only `id` and `email` ever leave this function.
  return {
    token,
    admin: { id: String(admin.uuid), email: String(admin.email) },
  }
}
