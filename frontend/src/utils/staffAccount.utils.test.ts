import { describe, expect, it } from 'vitest'

import {
  normalizeStaffAccount,
  validateStaffAccount,
  validateStaffAccountField,
  PASSWORD_MIN_LENGTH,
} from './staffAccount.utils'
import type { StaffAccountDraft } from '../types/auth.types'

function buildDraft(overrides: Partial<StaffAccountDraft> = {}): StaffAccountDraft {
  return {
    name: 'Dana Levi',
    email: 'dana@example.com',
    password: 'a-good-password',
    ...overrides,
  }
}

describe('validateStaffAccount', () => {
  it('accepts a fully filled form', () => {
    expect(validateStaffAccount(buildDraft())).toEqual({})
  })

  it('flags every empty field at once rather than one per attempt', () => {
    expect(validateStaffAccount({ name: '', email: '', password: '' })).toEqual({
      name: 'adminStaff.form.name.required',
      email: 'adminStaff.form.email.required',
      password: 'adminStaff.form.password.required',
    })
  })

  it('treats a whitespace-only name as empty', () => {
    expect(validateStaffAccount(buildDraft({ name: '   ' })).name).toBe(
      'adminStaff.form.name.required',
    )
  })
})

describe('name validation', () => {
  it('rejects a single character as too short to identify anyone', () => {
    expect(validateStaffAccountField('name', buildDraft({ name: 'D' }))).toBe(
      'adminStaff.form.name.tooShort',
    )
  })

  it('rejects a name past the 60-character limit', () => {
    expect(validateStaffAccountField('name', buildDraft({ name: 'a'.repeat(61) }))).toBe(
      'adminStaff.form.name.tooLong',
    )
  })

  it('measures the trimmed name, not the padding around it', () => {
    expect(validateStaffAccountField('name', buildDraft({ name: `  ${'a'.repeat(60)}  ` }))).toBe(
      undefined,
    )
  })
})

describe('email validation', () => {
  it.each(['dana', 'dana@', '@example.com', 'dana@example', 'dana example@x.com'])(
    'rejects %s as malformed',
    (email) => {
      expect(validateStaffAccountField('email', buildDraft({ email }))).toBe(
        'adminStaff.form.email.invalid',
      )
    },
  )

  it.each(['dana@example.com', 'dana+staff@example.co.il', 'd.levi@sub.example.travel'])(
    'accepts %s',
    (email) => {
      expect(validateStaffAccountField('email', buildDraft({ email }))).toBeUndefined()
    },
  )

  it('rejects an address past the 254-character limit', () => {
    const email = `${'a'.repeat(250)}@example.com`
    expect(validateStaffAccountField('email', buildDraft({ email }))).toBe(
      'adminStaff.form.email.tooLong',
    )
  })

  it('insists on an email here even though the login form accepts a username', () => {
    // The asymmetry is deliberate: login must accept whatever the seeded
    // account was given, but this form defines a brand-new account, so a typo
    // is worth catching before it becomes an account nobody can sign in to.
    expect(validateStaffAccountField('email', buildDraft({ email: 'dana' }))).toBe(
      'adminStaff.form.email.invalid',
    )
  })
})

describe('password validation', () => {
  it('rejects a password below the minimum length', () => {
    const password = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
    expect(validateStaffAccountField('password', buildDraft({ password }))).toBe(
      'adminStaff.form.password.tooShort',
    )
  })

  it('accepts a password exactly at the minimum length', () => {
    const password = 'a'.repeat(PASSWORD_MIN_LENGTH)
    expect(validateStaffAccountField('password', buildDraft({ password }))).toBeUndefined()
  })

  it('rejects a password past bcrypt’s 72-byte ceiling instead of silently truncating it', () => {
    expect(validateStaffAccountField('password', buildDraft({ password: 'a'.repeat(73) }))).toBe(
      'adminStaff.form.password.tooLong',
    )
  })

  it('counts spaces as real characters rather than trimming them away', () => {
    // '  abcdef  ' is 10 characters and must pass, because those spaces are
    // part of the password the Admin chose.
    expect(validateStaffAccountField('password', buildDraft({ password: '  abcdef  ' }))).toBe(
      undefined,
    )
  })
})

describe('normalizeStaffAccount', () => {
  it('trims the name and the email', () => {
    const normalized = normalizeStaffAccount(
      buildDraft({ name: '  Dana Levi  ', email: '  dana@example.com  ' }),
    )

    expect(normalized.name).toBe('Dana Levi')
    expect(normalized.email).toBe('dana@example.com')
  })

  it('lower-cases the email so capitalisation cannot create a second account', () => {
    expect(normalizeStaffAccount(buildDraft({ email: 'Dana@Example.COM' })).email).toBe(
      'dana@example.com',
    )
  })

  it('never touches the password', () => {
    // Stripping these spaces would create an account whose password is not the
    // one the Admin thinks they set — a login that fails forever, invisibly.
    expect(normalizeStaffAccount(buildDraft({ password: ' secret ' })).password).toBe(' secret ')
  })
})
