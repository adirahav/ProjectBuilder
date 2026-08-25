import { describe, expect, it } from 'vitest'
import {
  hasFieldErrors,
  isAdmin,
  validateEmail,
  validateFullName,
  validatePassword,
  validateLogin,
  validateSignup,
} from './auth.utils'

describe('validateFullName', () => {
  it('rejects an empty name', () => {
    expect(validateFullName('')).toBe('יש להזין שם מלא')
  })

  it('rejects a whitespace-only name', () => {
    expect(validateFullName('   ')).toBe('יש להזין שם מלא')
  })

  it('rejects a single-character name', () => {
    expect(validateFullName('ה')).toBe('השם המלא קצר מדי')
  })

  it('accepts a Hebrew full name', () => {
    expect(validateFullName('הילה כהן')).toBeUndefined()
  })
})

describe('validateEmail', () => {
  it('rejects an empty email', () => {
    expect(validateEmail('')).toBe('יש להזין כתובת אימייל')
  })

  it.each(['hila', 'hila@', '@example.com', 'hila@example', 'hi la@example.com'])(
    'rejects the malformed email %s',
    (email) => {
      expect(validateEmail(email)).toBe('כתובת האימייל אינה תקינה')
    },
  )

  it('accepts a well-formed email', () => {
    expect(validateEmail('hila@example.com')).toBeUndefined()
  })

  it('ignores surrounding whitespace', () => {
    expect(validateEmail('  hila@example.com  ')).toBeUndefined()
  })
})

describe('validatePassword', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('')).toBe('יש להזין סיסמה')
  })

  it('rejects a password shorter than 8 characters', () => {
    expect(validatePassword('Aeg2026')).toBe('הסיסמה חייבת להכיל לפחות 8 תווים')
  })

  it('rejects a password with no digit', () => {
    expect(validatePassword('AegeanSea')).toBe('הסיסמה חייבת להכיל לפחות אות אחת וספרה אחת')
  })

  it('rejects a password with no letter', () => {
    expect(validatePassword('12345678')).toBe('הסיסמה חייבת להכיל לפחות אות אחת וספרה אחת')
  })

  it('accepts a password with a letter and a digit at the minimum length', () => {
    expect(validatePassword('Aegean26')).toBeUndefined()
  })

  it('accepts a Hebrew-letter password with a digit', () => {
    expect(validatePassword('סיסמהחזקה7')).toBeUndefined()
  })
})

describe('validateSignup', () => {
  it('returns no errors for a fully valid form', () => {
    const errors = validateSignup({
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      password: 'Aegean2026',
    })

    expect(errors).toEqual({})
    expect(hasFieldErrors(errors)).toBe(false)
  })

  it('reports every invalid field at once', () => {
    const errors = validateSignup({ fullName: '', email: 'nope', password: 'short' })

    expect(Object.keys(errors).sort()).toEqual(['email', 'fullName', 'password'])
    expect(hasFieldErrors(errors)).toBe(true)
  })
})

describe('validateLogin', () => {
  it('accepts a filled-in credential pair', () => {
    const errors = validateLogin({ email: 'hila@example.com', password: 'Aegean2026' })

    expect(errors).toEqual({})
    expect(hasFieldErrors(errors)).toBe(false)
  })

  it('requires both fields', () => {
    const errors = validateLogin({ email: '', password: '' })

    expect(errors.email).toBeDefined()
    expect(errors.password).toBeDefined()
    expect(hasFieldErrors(errors)).toBe(true)
  })

  it('rejects a malformed email identifier', () => {
    expect(validateLogin({ email: 'nope', password: 'Aegean2026' }).email).toBeDefined()
  })

  it('does not apply the signup password policy, so old passwords can still log in', () => {
    // A 5-char password would fail validateSignup; login must still submit it
    // and let the server be the authority on whether it is correct.
    const errors = validateLogin({ email: 'hila@example.com', password: 'short' })

    expect(errors.password).toBeUndefined()
    expect(hasFieldErrors(errors)).toBe(false)
  })
})

describe('hasFieldErrors', () => {
  it('ignores keys that were explicitly cleared to undefined', () => {
    expect(hasFieldErrors({ email: undefined, password: undefined })).toBe(false)
  })
})

describe('isAdmin', () => {
  it('is false for a freshly signed-up account', () => {
    expect(isAdmin(['user'])).toBe(false)
  })

  it('is false when roles are missing', () => {
    expect(isAdmin(undefined)).toBe(false)
  })

  it('is true only when the admin role is present', () => {
    expect(isAdmin(['user', 'admin'])).toBe(true)
  })
})
