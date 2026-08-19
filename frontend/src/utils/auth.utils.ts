import type { StringKey } from '../i18n/strings'
import type { AdminCredentials } from '../types/auth.types'

/**
 * Client-side validation for the Admin login form (PRD F5).
 *
 * Deliberately minimal: both fields are simply required. Anything stricter —
 * a password-strength rule, an "email must look like an email" pattern — would
 * be guessing at a credential the server already knows the shape of, and would
 * only ever reject a correct login. The identifier is intentionally *not*
 * checked against an email pattern, because the account may be identified by a
 * username instead (PRD Screen 5: "Email/username + password").
 *
 * Returns i18n *keys* rather than sentences, so the same rules render in Hebrew
 * or English without this file knowing either language.
 *
 * These rules are a courtesy, not a security boundary: user-service validates
 * independently and is the only side that decides whether a login succeeds.
 */

export type CredentialField = keyof AdminCredentials

export type AdminCredentialsErrors = Partial<Record<CredentialField, StringKey>>

/** Whitespace-trimmed identifier. The password is never trimmed — leading and
 * trailing spaces are legitimate characters in a password, and silently
 * stripping them would turn a correct password into a failed login. */
export function normalizeCredentials(credentials: AdminCredentials): AdminCredentials {
  return {
    identifier: credentials.identifier.trim(),
    password: credentials.password,
  }
}

/**
 * Validates one field. Exported so the form can re-check a single input on blur
 * without flagging the field the Admin has not reached yet.
 */
export function validateCredentialField(
  field: CredentialField,
  credentials: AdminCredentials,
): StringKey | undefined {
  if (field === 'identifier') {
    return credentials.identifier.trim() ? undefined : 'adminLogin.form.identifier.required'
  }

  return credentials.password ? undefined : 'adminLogin.form.password.required'
}

/** Validates the whole form. An empty object means it is safe to submit. */
export function validateCredentials(credentials: AdminCredentials): AdminCredentialsErrors {
  const errors: AdminCredentialsErrors = {}

  for (const field of ['identifier', 'password'] as const) {
    const error = validateCredentialField(field, credentials)
    if (error) errors[field] = error
  }

  return errors
}
