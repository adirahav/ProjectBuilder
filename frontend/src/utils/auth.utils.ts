import type { Role, SignupFieldErrors, SignupPayload } from '../types/auth.types'

/**
 * Client-side signup validation (plan 005, Open Question 2).
 *
 * Client-side only — the server re-validates authoritatively. Failures here
 * render as inline red text under the field, never as a toast
 * (.rule/error-handling-rules.md).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** At least one letter — Latin or Hebrew (U+0590–U+05FF). */
const LETTER_PATTERN = new RegExp('[A-Za-z\\u0590-\\u05FF]')
const DIGIT_PATTERN = /\d/
const MIN_FULL_NAME_LENGTH = 2
export const MIN_PASSWORD_LENGTH = 8

export function validateFullName(fullName: string): string | undefined {
  const trimmed = fullName.trim()
  if (!trimmed) return 'יש להזין שם מלא'
  if (trimmed.length < MIN_FULL_NAME_LENGTH) return 'השם המלא קצר מדי'
  return undefined
}

export function validateEmail(email: string): string | undefined {
  const trimmed = email.trim()
  if (!trimmed) return 'יש להזין כתובת אימייל'
  if (!EMAIL_PATTERN.test(trimmed)) return 'כתובת האימייל אינה תקינה'
  return undefined
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'יש להזין סיסמה'
  if (password.length < MIN_PASSWORD_LENGTH) return 'הסיסמה חייבת להכיל לפחות 8 תווים'
  if (!LETTER_PATTERN.test(password) || !DIGIT_PATTERN.test(password)) {
    return 'הסיסמה חייבת להכיל לפחות אות אחת וספרה אחת'
  }
  return undefined
}

/** Validates the whole form. An empty object means the form may be submitted. */
export function validateSignup(values: SignupPayload): SignupFieldErrors {
  const errors: SignupFieldErrors = {}

  const fullName = validateFullName(values.fullName)
  if (fullName) errors.fullName = fullName

  const email = validateEmail(values.email)
  if (email) errors.email = email

  const password = validatePassword(values.password)
  if (password) errors.password = password

  return errors
}

export function hasFieldErrors(errors: SignupFieldErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * Whether an account carries admin permissions. A freshly signed-up account
 * never does — only an existing admin can promote it (PRD F2b).
 */
export function isAdmin(roles: Role[] | undefined): boolean {
  return Boolean(roles?.includes('admin'))
}
