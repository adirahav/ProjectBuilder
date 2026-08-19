import { describe, expect, it } from 'vitest'

import { normalizeCredentials, validateCredentialField, validateCredentials } from './auth.utils'
import type { AdminCredentials } from '../types/auth.types'

const credentials: AdminCredentials = {
  identifier: 'admin@example.com',
  password: 'a-password',
}

describe('validateCredentials', () => {
  it('accepts a filled-in form', () => {
    expect(validateCredentials(credentials)).toEqual({})
  })

  it('flags a missing identifier', () => {
    expect(validateCredentials({ ...credentials, identifier: '' })).toEqual({
      identifier: 'adminLogin.form.identifier.required',
    })
  })

  it('flags a missing password', () => {
    expect(validateCredentials({ ...credentials, password: '' })).toEqual({
      password: 'adminLogin.form.password.required',
    })
  })

  it('treats a whitespace-only identifier as missing', () => {
    expect(validateCredentials({ ...credentials, identifier: '   ' })).toHaveProperty('identifier')
  })

  it('accepts a username, not only an email address', () => {
    // PRD Screen 5 allows either, so an email pattern here would lock the Admin
    // out of their own account.
    expect(validateCredentials({ ...credentials, identifier: 'admin' })).toEqual({})
  })

  it('never judges the shape of a password, only that one was typed', () => {
    expect(validateCredentials({ ...credentials, password: ' ' })).toEqual({})
    expect(validateCredentials({ ...credentials, password: 'x' })).toEqual({})
  })

  it('reports both problems at once rather than one at a time', () => {
    expect(Object.keys(validateCredentials({ identifier: '', password: '' }))).toHaveLength(2)
  })
})

describe('validateCredentialField', () => {
  it('checks one field without flagging the other', () => {
    expect(validateCredentialField('identifier', { identifier: '', password: '' })).toBe(
      'adminLogin.form.identifier.required',
    )
    expect(validateCredentialField('password', { identifier: '', password: 'set' })).toBeUndefined()
  })
})

describe('normalizeCredentials', () => {
  it('trims the identifier, which is where a stray space is always a typo', () => {
    expect(normalizeCredentials({ ...credentials, identifier: '  admin@example.com ' })).toEqual({
      identifier: 'admin@example.com',
      password: 'a-password',
    })
  })

  it('leaves the password exactly as typed, spaces included', () => {
    // Trimming here would quietly turn a correct password into a failed login.
    expect(normalizeCredentials({ identifier: 'admin', password: '  spaced  ' }).password).toBe(
      '  spaced  ',
    )
  })
})
