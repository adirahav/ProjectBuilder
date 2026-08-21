import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// Must run before the module graph (and therefore lib/config.ts) is imported.
const TEST_SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-shared-with-user-service'
  process.env.USER_SERVICE_URL = 'http://user.test:4002'
  return process.env.JWT_SECRET
})

const { createApp } = await import('../app.ts')

type Call = { url: string; headers: Record<string, string> }

let calls: Call[] = []

function mockUpstream(status: number, body: unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    forwardedBodies.push(JSON.parse(String(init?.body ?? '{}')))
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sign(
  payload: object = { sub: 'admin-uuid', role: 'admin' },
  options: jwt.SignOptions = { expiresIn: '1h' },
) {
  return jwt.sign(payload, TEST_SECRET, options)
}

function auth() {
  return `Bearer ${sign()}`
}

let forwardedBodies: Record<string, unknown>[] = []

beforeEach(() => {
  forwardedBodies = []
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/auth/login', () => {
  it('returns 200 with the token and admin when user-service accepts the credentials', async () => {
    const upstream = {
      token: 'a.signed.jwt',
      admin: { id: '3d0f1a2b-4c5d-4e6f-8091-a2b3c4d5e6f7', email: 'admin@example.com' },
    }
    mockUpstream(200, upstream)

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'correct-horse-battery-staple' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(upstream)
  })

  it('relays the password untrimmed — leading/trailing spaces are real characters', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: '  admin@example.com  ', password: '  spaced  ' })

    const forwarded = forwardedBodies[0]
    expect(forwarded.password).toBe('  spaced  ')
    expect(forwarded.identifier).toBe('admin@example.com')
  })

  it('forwards only identifier and password, dropping any extra client fields', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw', role: 'superadmin', isAdmin: true })

    expect(Object.keys(forwardedBodies[0]).sort()).toEqual(['identifier', 'password'])
  })

  it('returns 401 with a generic message for a wrong password', async () => {
    mockUpstream(401, { error: 'Invalid credentials' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid credentials' })
  })

  it('returns an identical 401 body for an unknown identifier (no user enumeration)', async () => {
    mockUpstream(401, { error: 'No such account' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid credentials' })
  })

  it('never echoes the submitted password in any response body', async () => {
    mockUpstream(401, { error: 'Invalid credentials' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'super-secret-pw' })

    expect(JSON.stringify(res.body)).not.toContain('super-secret-pw')
  })

  it('returns 400 when the identifier is missing', async () => {
    const fetchMock = mockUpstream(200, {})

    const res = await request(createApp()).post('/api/auth/login').send({ password: 'pw' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Identifier and password are required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the password is missing', async () => {
    const fetchMock = mockUpstream(200, {})

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com' })

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the identifier is only whitespace', async () => {
    mockUpstream(200, {})

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: '   ', password: 'pw' })

    expect(res.status).toBe(400)
  })

  it('returns 502 when user-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Authentication service unavailable' })
  })

  it('returns 502 — never a credential error — when user-service returns a 500', async () => {
    mockUpstream(500, { error: 'boom' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Authentication service unavailable' })
  })

  it('requires no Authorization header — this is how the token is obtained', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).toBe(200)
  })

  it('stays public after register was gated — the split did not lock login out', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })
})

const VALID = {
  name: 'Dana Levi',
  email: 'dana@example.com',
  password: 'correct-horse-battery-staple',
}

const CREATED = {
  admin: { id: '9f8e7d6c-5b4a-4321-8765-0a1b2c3d4e5f', name: 'Dana Levi', email: 'dana@example.com' },
}

// The single most important group in this file. PRD F12 names an open version
// of this route as a security regression to be rejected in review.
describe('POST /api/auth/register — authentication gate', () => {
  it('returns 401 with NO Authorization header, and never reaches user-service', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp()).post('/api/auth/register').send(VALID)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 401 for a token signed with the wrong secret', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'x', role: 'admin' }, 'not-the-secret')}`)
      .send(VALID)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 401 for an expired token', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign({ sub: 'x', role: 'admin' }, { expiresIn: '-1h' })}`)
      .send(VALID)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 401 for a malformed Authorization header', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', 'Bearer ')
      .send(VALID)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a token whose role claim is not admin', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign({ sub: 'x', role: 'customer' })}`)
      .send(VALID)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gates the route BEFORE validation — a bad body with no token is still 401', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp()).post('/api/auth/register').send({})

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/register', () => {
  it('returns 201 with the created account when user-service accepts it', async () => {
    mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send(VALID)

    expect(res.status).toBe(201)
    expect(res.body).toEqual(CREATED)
  })

  it('never returns a password, a hash, or a token', async () => {
    mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send(VALID)

    const serialised = JSON.stringify(res.body)
    expect(serialised).not.toContain(VALID.password)
    expect(serialised).not.toContain('passwordHash')
    expect(res.body).not.toHaveProperty('token')
  })

  it('forwards to user-service with the verified admin id, not a client-supplied one', async () => {
    mockUpstream(201, CREATED)

    await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .set('x-internal-admin', 'spoofed-admin')
      .send(VALID)

    expect(calls[0].url).toBe('http://user.test:4002/api/auth/register')
    expect(calls[0].headers['x-internal-admin']).toBe('admin-uuid')
  })

  it('forwards only name, email and password, dropping any extra client fields', async () => {
    mockUpstream(201, CREATED)

    await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, role: 'superadmin', isActive: false, id: 'chosen-by-client' })

    expect(Object.keys(forwardedBodies[0]).sort()).toEqual(['email', 'name', 'password'])
  })

  it('normalises the email to lower case and trims it', async () => {
    mockUpstream(201, CREATED)

    await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, email: '  Dana@Example.COM  ' })

    expect(forwardedBodies[0].email).toBe('dana@example.com')
  })

  it('relays the password untrimmed — leading/trailing spaces are real characters', async () => {
    mockUpstream(201, CREATED)

    await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, password: '  spaced-password  ' })

    expect(forwardedBodies[0].password).toBe('  spaced-password  ')
  })

  it('returns 409 when the email is already taken', async () => {
    mockUpstream(409, { error: 'taken by admin@example.com' })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send(VALID)

    expect(res.status).toBe(409)
    // Names the field and stops there — it must not leak who owns the account.
    expect(res.body).toEqual({ error: 'An account with that email already exists' })
    expect(JSON.stringify(res.body)).not.toContain('admin@example.com')
  })

  it('returns 400 when the name is missing', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ email: VALID.email, password: VALID.password })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Name, email and password are required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the name is only whitespace', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, name: '   ' })

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 for a one-character name and for a 61-character name', async () => {
    const app = createApp()
    mockUpstream(201, CREATED)

    const short = await request(app)
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, name: 'D' })
    const long = await request(app)
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, name: 'D'.repeat(61) })

    expect(short.status).toBe(400)
    expect(long.status).toBe(400)
  })

  it('returns 400 when the email is missing or not an address', async () => {
    const app = createApp()
    const fetchMock = mockUpstream(201, CREATED)

    const missing = await request(app)
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ name: VALID.name, password: VALID.password })
    const malformed = await request(app)
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, email: 'not-an-email' })

    expect(missing.status).toBe(400)
    expect(malformed.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the password is missing or shorter than 8 characters', async () => {
    const app = createApp()
    const fetchMock = mockUpstream(201, CREATED)

    const missing = await request(app)
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ name: VALID.name, email: VALID.email })
    const short = await request(app)
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, password: 'short7!' })

    expect(missing.status).toBe(400)
    expect(short.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 for a password past bcrypt 72-byte ceiling, rather than silently truncating', async () => {
    const fetchMock = mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, password: 'a'.repeat(73) })

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never echoes the submitted password in a validation error', async () => {
    mockUpstream(201, CREATED)

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send({ ...VALID, name: '', password: 'super-secret-pw' })

    expect(JSON.stringify(res.body)).not.toContain('super-secret-pw')
  })

  it('returns 502 when user-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send(VALID)

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Authentication service unavailable' })
  })

  it('returns 502 — never a validation error — when user-service returns a 500', async () => {
    mockUpstream(500, { error: 'boom' })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', auth())
      .send(VALID)

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Authentication service unavailable' })
  })
})

// The PRD's named regression: no unauthenticated path to account creation.
describe('no public account-creation route exists', () => {
  it.each(['/api/signup', '/api/register', '/api/auth/signup'])(
    '%s is not mounted',
    async (path) => {
      mockUpstream(201, CREATED)

      const res = await request(createApp()).post(path).send(VALID)

      expect([401, 404]).toContain(res.status)
      expect(res.status).not.toBe(201)
    },
  )
})
