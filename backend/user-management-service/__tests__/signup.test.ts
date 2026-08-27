import { describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createApp } from '../api/app.js'
import { Admin } from '../api/models/Admin.model.js'

const app = createApp()

const VALID = {
  fullName: 'הילה כהן',
  email: 'hila@example.com',
  password: 'Aegean2026',
}

const signup = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/signup').send(body)

describe('POST /api/auth/signup — happy path', () => {
  it('creates the account and returns the contract SignupResponse shape', async () => {
    const res = await signup(VALID)

    expect(res.status).toBe(201)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).toEqual({
      id: expect.any(String),
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      roles: ['user'],
    })
  })

  it('issues a token whose claims match the created account', async () => {
    const res = await signup(VALID)
    const payload = jwt.verify(
      res.body.token,
      'test-only-jwt-secret-not-a-real-credential',
    ) as Record<string, any>

    expect(payload.sub).toBe(res.body.user.id)
    expect(payload.email).toBe('hila@example.com')
    expect(payload.roles).toEqual(['user'])
    // The contract requires an expiry claim on the session token.
    expect(payload.exp).toBeTypeOf('number')
  })

  it('normalizes the email to lowercase and trims whitespace', async () => {
    const res = await signup({ ...VALID, email: '  HiLa@Example.COM  ' })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('hila@example.com')
  })
})

describe('POST /api/auth/signup — never leaks the password', () => {
  it('stores a bcrypt hash, not the plaintext password', async () => {
    await signup(VALID)
    const doc = await Admin.findOne({ email: VALID.email })

    expect(doc).not.toBeNull()
    expect(doc!.passwordHash).not.toBe(VALID.password)
    expect(doc!.passwordHash.startsWith('$2')).toBe(true)
    // The hash must actually verify — a hash that never matches would pass a
    // naive "is not the plaintext" assertion while breaking every future login.
    expect(await bcrypt.compare(VALID.password, doc!.passwordHash)).toBe(true)
  })

  it('returns no passwordHash, _id or password anywhere in the response body', async () => {
    const res = await signup(VALID)
    const serialized = JSON.stringify(res.body)

    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('_id')
    expect(serialized).not.toContain(VALID.password)
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'fullName', 'id', 'roles'])
  })
})

describe('POST /api/auth/signup — role invariant (contract AC-2 / PRD F2b)', () => {
  it('ignores a client-supplied roles array and persists roles: ["user"]', async () => {
    const res = await signup({ ...VALID, roles: ['admin'] })

    expect(res.status).toBe(201)
    expect(res.body.user.roles).toEqual(['user'])

    const doc = await Admin.findOne({ email: VALID.email })
    expect(doc!.roles).toEqual(['user'])
  })

  it('ignores client-supplied role / isAdmin fields', async () => {
    const res = await signup({ ...VALID, role: 'admin', isAdmin: true })

    expect(res.status).toBe(201)
    expect(res.body.user.roles).toEqual(['user'])
  })

  it('issues a token that cannot pass an admin role gate', async () => {
    const res = await signup({ ...VALID, roles: ['admin'] })
    const payload = jwt.verify(
      res.body.token,
      'test-only-jwt-secret-not-a-real-credential',
    ) as Record<string, any>

    expect(payload.roles).not.toContain('admin')
  })
})

describe('POST /api/auth/signup — duplicate email', () => {
  it('rejects a second signup with the same email with 409 EMAIL_TAKEN', async () => {
    await signup(VALID)
    const res = await signup({ ...VALID, fullName: 'Someone Else' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_TAKEN')
  })

  it('treats a differently-cased duplicate email as the same account', async () => {
    await signup(VALID)
    const res = await signup({ ...VALID, email: 'HILA@EXAMPLE.COM' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_TAKEN')
  })

  it('lets exactly one of two concurrent same-email signups succeed', async () => {
    // The application-level pre-check cannot decide this — both requests can
    // pass it. The database unique index is what makes the loser fail, which is
    // exactly what the contract requires.
    const results = await Promise.all([signup(VALID), signup(VALID)])
    const statuses = results.map((r) => r.status).sort()

    expect(statuses).toEqual([201, 409])
    expect(await Admin.countDocuments({ email: VALID.email })).toBe(1)
  })
})

describe('POST /api/auth/signup — validation failures', () => {
  it.each([
    ['missing fullName', { email: VALID.email, password: VALID.password }],
    ['missing email', { fullName: VALID.fullName, password: VALID.password }],
    ['missing password', { fullName: VALID.fullName, email: VALID.email }],
    ['empty body', {}],
    ['blank fullName', { ...VALID, fullName: '   ' }],
    ['fullName too short', { ...VALID, fullName: 'א' }],
    ['fullName too long', { ...VALID, fullName: 'a'.repeat(121) }],
    ['malformed email', { ...VALID, email: 'not-an-email' }],
    ['password too short', { ...VALID, password: 'Ae2026' }],
    ['password with no digit', { ...VALID, password: 'AegeanSeaTour' }],
    ['password with no letter', { ...VALID, password: '20262026' }],
  ])('rejects %s with 400 VALIDATION_FAILED', async (_label, body) => {
    const res = await signup(body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
    expect(await Admin.countDocuments({})).toBe(0)
  })

  it('never echoes the submitted password in a validation message', async () => {
    const res = await signup({ ...VALID, password: 'short1' })

    expect(res.status).toBe(400)
    expect(res.body.message).not.toContain('short1')
  })
})

describe('routing', () => {
  it('returns a structured 404 for an unknown route', async () => {
    const res = await request(app).get('/api/auth/nope')

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
