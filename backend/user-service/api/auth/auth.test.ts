import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { createApp } from '../app.ts'
import { Admin } from '../models/admin.model.ts'
import { config } from '../lib/config.ts'

// No Mongo instance is available in this test environment, so the model's
// query surface is stubbed. That keeps these tests deterministic and fast
// while still exercising the real controller, service, bcrypt comparison and
// JWT signing — i.e. everything that actually implements the contract.
const TEST_SECRET = 'test-secret-not-a-real-credential'
const TEST_PASSWORD = 'correct-horse-battery-staple'
const TEST_EMAIL = 'admin@example.com'
const TEST_UUID = '3d0f1a2b-4c5d-4e6f-8091-a2b3c4d5e6f7'

let passwordHash: string

function stubAdminLookup(doc: unknown) {
  return vi.spyOn(Admin, 'findOne').mockResolvedValue(doc as never)
}

beforeEach(async () => {
  config.jwtSecret = TEST_SECRET
  config.jwtExpiresIn = '24h'
  // Cost 4 keeps the suite fast; production hashing uses the seed script's 12.
  passwordHash = await bcrypt.hash(TEST_PASSWORD, 4)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/auth/login — success', () => {
  it('returns 200 with a token and the public admin on correct credentials', async () => {
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.admin).toEqual({ id: TEST_UUID, email: TEST_EMAIL })
    expect(typeof res.body.token).toBe('string')
  })

  it('signs an HS256 token carrying the admin uuid and an admin role claim', async () => {
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    const decoded = jwt.verify(res.body.token, TEST_SECRET, {
      algorithms: ['HS256'],
    }) as Record<string, unknown>

    expect(decoded.userId).toBe(TEST_UUID)
    expect(decoded.roles).toEqual(['admin'])
    // Bounded lifetime is a security requirement, not an optional extra.
    expect(typeof decoded.exp).toBe('number')
  })

  it('never returns the password hash or the Mongo _id in the response', async () => {
    stubAdminLookup({
      _id: 'internal-object-id',
      uuid: TEST_UUID,
      email: TEST_EMAIL,
      passwordHash,
    })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    const body = JSON.stringify(res.body)
    expect(body).not.toContain('passwordHash')
    expect(body).not.toContain('internal-object-id')
    expect(body).not.toContain(TEST_PASSWORD)
  })

  it('accepts the identifier case-insensitively and with surrounding whitespace', async () => {
    const findOne = stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: '  ADMIN@Example.com  ', password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(findOne).toHaveBeenCalledWith({ email: TEST_EMAIL })
  })

  it('does not trim the password — leading/trailing spaces are real characters', async () => {
    const spacedHash = await bcrypt.hash('  spaced  ', 4)
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash: spacedHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: '  spaced  ' })

    expect(res.status).toBe(200)
  })
})

describe('POST /api/auth/login — 401 invalid credentials', () => {
  it('returns 401 when the password is wrong', async () => {
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid credentials' })
    expect(res.body.token).toBeUndefined()
  })

  it('returns 401 when the identifier is unknown', async () => {
    stubAdminLookup(null)

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: TEST_PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid credentials' })
  })

  it('returns a byte-identical body for unknown-account and wrong-password', async () => {
    // The core anti-enumeration guarantee: the client must not be able to tell
    // "no such account" from "wrong password" by inspecting the response.
    const unknownSpy = stubAdminLookup(null)
    const unknown = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: TEST_PASSWORD })
    unknownSpy.mockRestore()

    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })
    const wrongPassword = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: 'wrong-password' })

    expect(unknown.status).toBe(wrongPassword.status)
    expect(unknown.body).toEqual(wrongPassword.body)
  })

  it('still runs a bcrypt comparison when no admin exists, to equalize timing', async () => {
    // Guards the timing-equalizer hash: skipping the compare on the
    // unknown-account path would make that path measurably faster and leak
    // account existence despite the identical response body.
    stubAdminLookup(null)
    const compareSpy = vi.spyOn(bcrypt, 'compare')

    await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: TEST_PASSWORD })

    expect(compareSpy).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/auth/login — 400 validation', () => {
  it.each([
    ['both fields missing', {}],
    ['password missing', { identifier: TEST_EMAIL }],
    ['identifier missing', { password: TEST_PASSWORD }],
    ['identifier blank', { identifier: '   ', password: TEST_PASSWORD }],
    ['password empty', { identifier: TEST_EMAIL, password: '' }],
    ['identifier not a string', { identifier: 123, password: TEST_PASSWORD }],
    ['password not a string', { identifier: TEST_EMAIL, password: { $ne: null } }],
  ])('returns 400 when %s', async (_label, body) => {
    const findOne = stubAdminLookup(null)

    const res = await request(createApp()).post('/api/auth/login').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Identifier and password are required' })
    // 400 means no credential check ever ran — the DB must not be touched.
    expect(findOne).not.toHaveBeenCalled()
  })

  it('rejects an over-long identifier with 400 rather than querying', async () => {
    const findOne = stubAdminLookup(null)

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'a'.repeat(255), password: TEST_PASSWORD })

    expect(res.status).toBe(400)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('does not let an object identifier become a NoSQL operator filter', async () => {
    // `{ $ne: null }` as an identifier would match any Admin if passed
    // straight into the query — it must be rejected as a non-string instead.
    const findOne = stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: TEST_PASSWORD })

    expect(res.status).toBe(400)
    expect(findOne).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/login — server configuration', () => {
  it('returns 500, not 401, when JWT_SECRET is blank', async () => {
    // A missing signing secret is an operator error. Reporting it as 401 would
    // send the Admin chasing a password problem that does not exist.
    config.jwtSecret = ''
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    expect(res.status).toBe(500)
    expect(res.body.token).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('JWT_SECRET')
  })

  it('returns 500 with a clean body when the lookup throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(Admin, 'findOne').mockRejectedValue(new Error('connection refused') as never)

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
    // No stack trace or raw driver message may reach the client.
    expect(JSON.stringify(res.body)).not.toContain('connection refused')
  })
})

describe('POST /api/auth/login — route wiring', () => {
  it('is genuinely public: no Authorization header is required', async () => {
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
  })

  it('does not expose login under any other method', async () => {
    const res = await request(createApp()).get('/api/auth/login')

    expect(res.status).toBe(404)
  })
})
