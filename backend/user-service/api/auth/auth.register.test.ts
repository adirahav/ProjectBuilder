import { describe, it, expect, vi, afterEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

import { createApp } from '../app.ts'
import { Admin } from '../models/admin.model.ts'

// POST /api/auth/register — PRD F12, Screen 8 (AC-10).
//
// No Mongo instance is available in this test environment, so the model's
// query surface is stubbed. That keeps these tests deterministic while still
// exercising the real route, controller, service, validation and bcrypt
// hashing — i.e. everything that actually implements the contract.
const NEW_NAME = 'Dana Levi'
const NEW_EMAIL = 'dana@example.com'
const NEW_PASSWORD = 'correct-horse-battery-staple'
const NEW_UUID = '9f8e7d6c-5b4a-4321-8765-0a1b2c3d4e5f'

/** No existing account for that email — the free-to-create path. */
function stubEmailFree() {
  return vi.spyOn(Admin, 'findOne').mockResolvedValue(null as never)
}

/** Captures what the service actually tried to insert. */
function stubCreate(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(Admin, 'create').mockImplementation((async (doc: Record<string, unknown>) => ({
    uuid: NEW_UUID,
    ...doc,
    ...overrides,
  })) as never)
}

function validBody() {
  return { name: NEW_NAME, email: NEW_EMAIL, password: NEW_PASSWORD }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/auth/register — 201 success', () => {
  it('creates the account and returns only its public fields', async () => {
    stubEmailFree()
    stubCreate()

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      admin: { id: NEW_UUID, name: NEW_NAME, email: NEW_EMAIL },
    })
  })

  it('never returns the password, a hash, a Mongo _id, or a token', async () => {
    stubEmailFree()
    stubCreate({ _id: 'internal-object-id' })

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    const body = JSON.stringify(res.body)
    expect(body).not.toContain('passwordHash')
    expect(body).not.toContain('internal-object-id')
    expect(body).not.toContain(NEW_PASSWORD)
    // Creating an account for somebody else must not mint a session.
    expect(res.body.token).toBeUndefined()
  })

  it('stores a bcrypt hash, never the plaintext password', async () => {
    stubEmailFree()
    const create = stubCreate()

    await request(createApp()).post('/api/auth/register').send(validBody())

    const inserted = create.mock.calls[0][0] as Record<string, string>
    expect(inserted.passwordHash).not.toBe(NEW_PASSWORD)
    expect(inserted.passwordHash.startsWith('$2')).toBe(true)
    // The stored hash must actually verify against the submitted password.
    expect(await bcrypt.compare(NEW_PASSWORD, inserted.passwordHash)).toBe(true)
  })

  it('normalizes the email and trims the name before storing', async () => {
    stubEmailFree()
    const create = stubCreate()

    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: '  Dana Levi  ', email: '  Dana@Example.COM ', password: NEW_PASSWORD })

    expect(res.status).toBe(201)
    const inserted = create.mock.calls[0][0] as Record<string, string>
    // Casing alone must never be able to produce a second account.
    expect(inserted.email).toBe(NEW_EMAIL)
    expect(inserted.name).toBe(NEW_NAME)
  })

  it('checks uniqueness against the normalized email, not the raw input', async () => {
    const findOne = stubEmailFree()
    stubCreate()

    await request(createApp())
      .post('/api/auth/register')
      .send({ ...validBody(), email: '  Dana@Example.COM ' })

    expect(findOne).toHaveBeenCalledWith({ email: NEW_EMAIL })
  })

  it('does not trim the password — leading/trailing spaces are real characters', async () => {
    stubEmailFree()
    const create = stubCreate()

    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ ...validBody(), password: '  spaced-out  ' })

    expect(res.status).toBe(201)
    const inserted = create.mock.calls[0][0] as Record<string, string>
    expect(await bcrypt.compare('  spaced-out  ', inserted.passwordHash)).toBe(true)
  })

  it('ignores client-supplied fields instead of spreading the request body', async () => {
    stubEmailFree()
    const create = stubCreate()

    await request(createApp())
      .post('/api/auth/register')
      .send({
        ...validBody(),
        uuid: 'attacker-chosen-uuid',
        passwordHash: '$2a$10$attacker-controlled-hash',
        createdAt: '1999-01-01T00:00:00.000Z',
      })

    const inserted = create.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(inserted).sort()).toEqual(['email', 'name', 'passwordHash'])
    expect(inserted.passwordHash).not.toBe('$2a$10$attacker-controlled-hash')
  })
})

describe('POST /api/auth/register — 409 duplicate email', () => {
  it('returns 409 when an account already exists for that email', async () => {
    vi.spyOn(Admin, 'findOne').mockResolvedValue({ uuid: 'existing', email: NEW_EMAIL } as never)
    const create = stubCreate()

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'An account with that email already exists' })
    expect(create).not.toHaveBeenCalled()
  })

  it('returns 409, not 500, when the unique index rejects a concurrent insert', async () => {
    // Two simultaneous requests can both pass the findOne check; the index is
    // the real guard, and the loser must surface as the same 409.
    stubEmailFree()
    vi.spyOn(Admin, 'create').mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }) as never,
    )

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'An account with that email already exists' })
  })

  it('does not reveal anything about the existing account', async () => {
    vi.spyOn(Admin, 'findOne').mockResolvedValue({
      uuid: 'existing-uuid',
      name: 'Someone Else',
      email: NEW_EMAIL,
      passwordHash: '$2a$12$existing',
      createdAt: new Date('2020-01-01'),
    } as never)

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    const body = JSON.stringify(res.body)
    expect(body).not.toContain('existing-uuid')
    expect(body).not.toContain('Someone Else')
    expect(body).not.toContain('2020')
    expect(body).not.toContain('passwordHash')
  })
})

describe('POST /api/auth/register — 400 validation', () => {
  it.each([
    ['all fields missing', {}],
    ['name missing', { email: NEW_EMAIL, password: NEW_PASSWORD }],
    ['email missing', { name: NEW_NAME, password: NEW_PASSWORD }],
    ['password missing', { name: NEW_NAME, email: NEW_EMAIL }],
    ['name blank', { name: '   ', email: NEW_EMAIL, password: NEW_PASSWORD }],
    ['email blank', { name: NEW_NAME, email: '   ', password: NEW_PASSWORD }],
    ['password empty', { name: NEW_NAME, email: NEW_EMAIL, password: '' }],
    ['name not a string', { name: 42, email: NEW_EMAIL, password: NEW_PASSWORD }],
    ['email not a string', { name: NEW_NAME, email: { $ne: null }, password: NEW_PASSWORD }],
    ['password not a string', { name: NEW_NAME, email: NEW_EMAIL, password: { $ne: null } }],
    ['name too short', { name: 'D', email: NEW_EMAIL, password: NEW_PASSWORD }],
    ['name too long', { name: 'D'.repeat(61), email: NEW_EMAIL, password: NEW_PASSWORD }],
    ['email has no @', { name: NEW_NAME, email: 'not-an-address', password: NEW_PASSWORD }],
    ['email has no domain dot', { name: NEW_NAME, email: 'dana@localhost', password: NEW_PASSWORD }],
    ['email has a space', { name: NEW_NAME, email: 'da na@example.com', password: NEW_PASSWORD }],
    [
      'email too long',
      { name: NEW_NAME, email: `${'a'.repeat(250)}@example.com`, password: NEW_PASSWORD },
    ],
    ['password below 8 characters', { name: NEW_NAME, email: NEW_EMAIL, password: '1234567' }],
    ['password over 72 bytes', { name: NEW_NAME, email: NEW_EMAIL, password: 'a'.repeat(73) }],
  ])('returns 400 when %s', async (_label, body) => {
    const findOne = stubEmailFree()
    const create = stubCreate()

    const res = await request(createApp()).post('/api/auth/register').send(body)

    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
    // 400 means nothing about the existing accounts was consulted.
    expect(findOne).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('counts the password ceiling in bytes, since that is what bcrypt truncates on', async () => {
    const findOne = stubEmailFree()
    stubCreate()

    // 40 multi-byte characters = 120 bytes: under any character-based limit,
    // but well over bcrypt's 72-byte one.
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ ...validBody(), password: 'é'.repeat(40) })

    expect(res.status).toBe(400)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('never echoes the submitted password back in an error message', async () => {
    stubEmailFree()

    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: '', email: NEW_EMAIL, password: 'super-secret-password' })

    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toContain('super-secret-password')
  })

  it('does not let an object email become a NoSQL operator filter', async () => {
    // `{ $ne: null }` passed straight into the query would match any Admin.
    const findOne = stubEmailFree()

    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: NEW_NAME, email: { $ne: null }, password: NEW_PASSWORD })

    expect(res.status).toBe(400)
    expect(findOne).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/register — failures and wiring', () => {
  it('returns 500 with a clean body when the lookup throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(Admin, 'findOne').mockRejectedValue(new Error('connection refused') as never)

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
    expect(JSON.stringify(res.body)).not.toContain('connection refused')
  })

  it('returns 500 for a non-duplicate insert failure, not 409', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubEmailFree()
    vi.spyOn(Admin, 'create').mockRejectedValue(new Error('write concern failed') as never)

    const res = await request(createApp()).post('/api/auth/register').send(validBody())

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })

  it('is not exposed under any other method', async () => {
    const res = await request(createApp()).get('/api/auth/register')

    expect(res.status).toBe(404)
  })

  it('is not exposed at a public /signup or /register alias', async () => {
    // The PRD names an open account-creation path as a security regression.
    const app = createApp()

    for (const path of ['/signup', '/register', '/api/signup', '/api/auth/signup']) {
      const res = await request(app).post(path).send(validBody())
      expect(res.status).toBe(404)
    }
  })
})
