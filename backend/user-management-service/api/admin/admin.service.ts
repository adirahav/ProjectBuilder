import bcrypt from 'bcryptjs'
import { Admin } from '../models/Admin.model.js'
import { config } from '../lib/config.js'
import { badRequest, conflict } from '../lib/errors.js'
import { signToken, type AdminRole } from '../lib/jwt.js'

/** Exactly the `AuthUser` schema from the API contract. Nothing else. */
export type PublicAdmin = {
  id: string
  fullName: string
  email: string
  roles: AdminRole[]
}

export type AuthResult = {
  token: string
  user: PublicAdmin
}

/**
 * Whitelist serializer — builds the response from named fields rather than
 * deleting unwanted ones from a document. A field that does not appear here
 * cannot leak, so `passwordHash`, `_id` and `deletedAt` are structurally
 * impossible to return (.rule/database-rules.md "External Identity").
 */
function toPublicAdmin(doc: any): PublicAdmin {
  return {
    id: doc.uuid,
    fullName: doc.fullName,
    email: doc.email,
    roles: doc.roles as AdminRole[],
  }
}

// Deliberately permissive: this rejects obvious typos without pretending to
// validate deliverability, which only sending mail can prove.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Mirrors the frontend's rule in `auth.utils.ts` exactly (minimum 8 characters,
 * at least one letter and at least one digit) so client and server can never
 * disagree about whether a password is acceptable. Enforced here regardless —
 * the client check is a convenience, not the authority.
 */
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

export type SignupInput = {
  fullName: string
  email: string
  password: string
}

/**
 * Validates the raw request body. Returns normalized values.
 *
 * NOTE: `body.roles` / `body.role` / `body.isAdmin` are read nowhere in this
 * function or its caller — that is the role invariant (contract AC-2), and it
 * is implemented by structural omission rather than by an explicit `delete`,
 * so there is no code path where client input could reach the `roles` column.
 */
function validateSignup(body: any): SignupInput {
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!fullName || !email || !password) {
    throw badRequest('fullName, email and password are required')
  }

  if (fullName.length < 2 || fullName.length > 120) {
    throw badRequest('Full name must be between 2 and 120 characters')
  }

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw badRequest('A valid email address is required')
  }

  // The message describes the policy and never echoes the submitted password.
  if (
    password.length < PASSWORD_MIN ||
    password.length > PASSWORD_MAX ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw badRequest(
      'Password must be at least 8 characters and contain a letter and a digit',
    )
  }

  return { fullName, email, password }
}

/**
 * Creates a `user`-level account and issues its session token (PRD F2).
 *
 * Role invariant: `roles` is hardcoded to `['user']` here. No signup code path
 * can produce an `admin` account — promotion is a separate, admin-gated
 * endpoint (`PATCH /api/admins/:id/roles`, F2b).
 */
export async function signup(body: unknown): Promise<AuthResult> {
  const { fullName, email, password } = validateSignup(body)

  // Application-level pre-check: gives the clean 409 in the common case. It is
  // NOT the authority — the unique index below is, because two concurrent
  // requests can both pass this check.
  const existing = await Admin.findOne({ email })
  if (existing) {
    throw conflict('Email already registered', 'EMAIL_TAKEN')
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds)

  let created
  try {
    created = await Admin.create({
      fullName,
      email,
      passwordHash,
      roles: ['user'], // hardcoded — never derived from the request body
    })
  } catch (err: any) {
    // Duplicate-key on the unique email index. This is the branch a losing
    // concurrent signup takes, and it must be the same 409 as the pre-check.
    if (err?.code === 11000) {
      throw conflict('Email already registered', 'EMAIL_TAKEN')
    }
    throw err
  }

  const user = toPublicAdmin(created)
  const token = signToken({ sub: user.id, email: user.email, roles: user.roles })

  return { token, user }
}
