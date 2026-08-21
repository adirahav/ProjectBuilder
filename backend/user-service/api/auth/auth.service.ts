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

export interface RegisterInput {
  name?: unknown
  email?: unknown
  password?: unknown
}

export interface StaffAccount {
  id: string
  name: string
  email: string
}

export interface RegisterResult {
  admin: StaffAccount
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

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that email already exists')
    this.name = 'EmailTakenError'
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

/** Matches the seed script's cost. Deliberately not lowered for convenience. */
const BCRYPT_ROUNDS = 12

const NAME_MIN = 2
const NAME_MAX = 60
const EMAIL_MAX = 254
const PASSWORD_MIN = 8
/**
 * bcrypt silently ignores everything past 72 *bytes* — not characters. A
 * longer password would quietly not be the password the Admin thinks they set,
 * so it is rejected outright rather than truncated.
 */
const PASSWORD_MAX_BYTES = 72

/** Deliberately permissive: enough to catch a typo, not a full RFC 5322 parser. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * PRD F12 / Screen 8 (AC-10): create an additional Admin account.
 *
 * SECURITY: this function performs NO authorization check of its own, by
 * design. Per the established trust boundary, api-gateway verifies the calling
 * Admin's JWT before forwarding, and user-service is not reachable from outside
 * the internal network. Anything that calls this is asserting the caller was
 * already authenticated — do not expose a new path to it without that gate.
 *
 * The created account is a full Admin (v1 has no roles) and can sign in
 * immediately: no activation step, no invite link, and deliberately no token
 * issued here — creating an account for somebody else must not mint a session.
 */
export async function createAdmin(input: RegisterInput): Promise<RegisterResult> {
  const { name, email, password } = input

  // --- Validation (400 territory) -----------------------------------------
  // Every field is type-checked as a string before use. An object like
  // `{ $ne: null }` reaching the query below would be a NoSQL-injection
  // vector, exactly as on the login path.
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw new ValidationError('Name, email and password are required')
  }

  const trimmedName = name.trim()
  // Normalised server-side rather than trusting the client to have done it,
  // so casing alone can never produce a second account for one address.
  const normalizedEmail = email.trim().toLowerCase()

  if (trimmedName.length === 0 || normalizedEmail.length === 0 || password.length === 0) {
    throw new ValidationError('Name, email and password are required')
  }
  if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
    throw new ValidationError(`Name must be between ${NAME_MIN} and ${NAME_MAX} characters`)
  }
  if (normalizedEmail.length > EMAIL_MAX || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new ValidationError('A valid email address is required')
  }
  // The password is NOT trimmed: leading/trailing spaces are real characters.
  if (password.length < PASSWORD_MIN) {
    throw new ValidationError(`Password must be at least ${PASSWORD_MIN} characters`)
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new ValidationError(`Password must be at most ${PASSWORD_MAX_BYTES} bytes`)
  }

  // --- Uniqueness (409 territory) -----------------------------------------
  // Checked up front so the common case returns a clean 409 without relying on
  // a driver error. Only the one field the route expects goes into the filter.
  const existing = await Admin.findOne({ email: normalizedEmail })
  if (existing) {
    throw new EmailTakenError()
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  let created
  try {
    created = await Admin.create({ name: trimmedName, email: normalizedEmail, passwordHash })
  } catch (err) {
    // The unique index — not the check above — is the real guard. Two
    // simultaneous requests for the same address can both pass the findOne;
    // exactly one insert then wins and the loser surfaces as the same 409
    // rather than a 500.
    if ((err as { code?: number }).code === 11000) {
      throw new EmailTakenError()
    }
    throw err
  }

  // Built by hand, like login's: only these three fields ever leave. No
  // password, no hash, no Mongo _id, no token.
  return {
    admin: {
      id: String(created.uuid),
      name: String(created.name),
      email: String(created.email),
    },
  }
}
