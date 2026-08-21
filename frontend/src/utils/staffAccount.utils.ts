import type { StringKey } from '../i18n/strings'
import type { StaffAccountDraft } from '../types/auth.types'

/**
 * Client-side validation for the new-staff-account form (PRD F12, Screen 8).
 *
 * Stricter than the login form's rules on purpose, and the difference is worth
 * stating: `auth.utils.ts` deliberately refuses to pattern-match the login
 * identifier, because guessing at a credential the server already knows the
 * shape of can only ever reject a correct sign-in. Here the opposite holds —
 * nothing exists yet, this form *defines* what the account will be, so a typo'd
 * address is a mistake that is cheap to catch now and expensive to discover
 * later (it becomes an account nobody can sign in to, with no self-service way
 * to fix it in v1).
 *
 * Returns i18n *keys* rather than sentences, so the same rules render in Hebrew
 * or English without this file knowing either language.
 *
 * These rules remain a courtesy, not a security boundary: user-service
 * validates independently and is the only side that decides whether an account
 * is created (.rule/error-handling-rules.md).
 */

export type StaffAccountField = keyof StaffAccountDraft

export type StaffAccountErrors = Partial<Record<StaffAccountField, StringKey>>

const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 60

// Same intentionally simple address check the Customer form uses: an address is
// either obviously malformed or has to be proven by sending mail to it, and a
// more elaborate pattern only rejects valid addresses (plus-tags, long TLDs)
// while still not proving the address exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const EMAIL_MAX_LENGTH = 254

/**
 * The minimum this form will submit. It is a floor, not a policy: user-service
 * enforces its own minimum, and the two only need to agree that a one-character
 * password is not acceptable for an account with full Admin privileges.
 */
export const PASSWORD_MIN_LENGTH = 8

// An upper bound because bcrypt silently truncates past 72 bytes; refusing well
// before that is clearer than accepting a password whose tail does nothing.
const PASSWORD_MAX_LENGTH = 72

/**
 * Trims the name and the email; never the password. Leading and trailing spaces
 * are legitimate password characters, and stripping them here would create an
 * account whose password is not the one the Admin thinks they set — a login
 * that fails forever, for a reason nobody can see.
 */
export function normalizeStaffAccount(draft: StaffAccountDraft): StaffAccountDraft {
  return {
    name: draft.name.trim(),
    // Lower-cased so "Dana@Example.com" and "dana@example.com" cannot become two
    // accounts, and so the duplicate check the server runs sees what the Admin
    // meant rather than how they happened to capitalise it.
    email: draft.email.trim().toLowerCase(),
    password: draft.password,
  }
}

/**
 * Validates one field. Exported so the form can re-check a single input on blur
 * without flagging a field the Admin has not reached yet.
 */
export function validateStaffAccountField(
  field: StaffAccountField,
  draft: StaffAccountDraft,
): StringKey | undefined {
  if (field === 'name') {
    const value = draft.name.trim()
    if (!value) return 'adminStaff.form.name.required'
    if (value.length < NAME_MIN_LENGTH) return 'adminStaff.form.name.tooShort'
    if (value.length > NAME_MAX_LENGTH) return 'adminStaff.form.name.tooLong'
    return undefined
  }

  if (field === 'email') {
    const value = draft.email.trim()
    if (!value) return 'adminStaff.form.email.required'
    if (value.length > EMAIL_MAX_LENGTH) return 'adminStaff.form.email.tooLong'
    if (!EMAIL_PATTERN.test(value)) return 'adminStaff.form.email.invalid'
    return undefined
  }

  // Untrimmed on purpose — see normalizeStaffAccount.
  if (!draft.password) return 'adminStaff.form.password.required'
  if (draft.password.length < PASSWORD_MIN_LENGTH) return 'adminStaff.form.password.tooShort'
  if (draft.password.length > PASSWORD_MAX_LENGTH) return 'adminStaff.form.password.tooLong'

  return undefined
}

/** Validates the whole form. An empty object means it is safe to submit. */
export function validateStaffAccount(draft: StaffAccountDraft): StaffAccountErrors {
  const errors: StaffAccountErrors = {}

  for (const field of ['name', 'email', 'password'] as const) {
    const error = validateStaffAccountField(field, draft)
    if (error) errors[field] = error
  }

  return errors
}
