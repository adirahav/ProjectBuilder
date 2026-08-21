/**
 * Security tests for ADMINDAS-SEC (plan 022 — Admin Dashboard: Staff Accounts).
 *
 * Scope: `POST /api/auth/register` (PRD F12 / Screen 8 / AC-10) — the ONE route
 * in this whole product that can mint a new, fully-privileged Admin account.
 * The PRD explicitly names an open/unauthenticated version of this route as a
 * security regression that must be rejected in review. These tests exist to
 * pin that down at both hops:
 *
 *   1. api-gateway  — `POST /api/auth/register` must be gated by `verifyJwt`,
 *      while `POST /api/auth/login` must stay public. A client-supplied
 *      `x-internal-admin` header must never survive the hop to user-service.
 *   2. user-service  — even though it trusts the gateway for authn, the
 *      account-creation path itself must not be exploitable: no mass
 *      assignment (passwordHash/uuid/role/_id via the body), no NoSQL
 *      injection through the email field, no plaintext password ever
 *      persisted or returned, duplicate-email races resolve to 409 not two
 *      accounts, and a newly created account can log in with no elevated
 *      claims beyond the standard `role: 'admin'`.
 *
 * Run:
 *   cd backend/api-gateway && npx vitest run ../../docs/tests/security/admin-dashboard-staff-accounts.security.test.ts
 *   cd backend/user-service && npx vitest run ../../docs/tests/security/admin-dashboard-staff-accounts.security.test.ts
 *
 * (Split into two describe blocks below; each only imports the app it needs,
 * mirroring the existing per-service security test pattern in this directory.)
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// api-gateway: the verifyJwt boundary itself.
// ---------------------------------------------------------------------------
describe('api-gateway: POST /api/auth/register (ADMINDAS-SEC)', () => {
  const TEST_SECRET = vi.hoisted(() => {
    process.env.JWT_SECRET = 'test-secret-shared-with-user-service'
    process.env.USER_SERVICE_URL = 'http://user.test:4002'
    return process.env.JWT_SECRET
  })

  let createApp: typeof import('../../../backend/api-gateway/api/app.ts').createApp

  beforeAll(async () => {
    ;({ createApp } = await import('../../../backend/api-gateway/api/app.ts'))
  })

  type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> }
  let calls: Call[]

  function mockUpstream(status: number, body: unknown) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String(init?.body ?? '{}')),
      })
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

  const validBody = { name: 'New Admin', email: 'new-admin@example.com', password: 'correct-horse-battery' }

  beforeEach(() => {
    calls = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects with 401 and never calls upstream when no Authorization header is sent', async () => {
    const fetchMock = mockUpstream(201, { admin: { id: 'x', name: 'x', email: 'x' } })

    const res = await request(createApp()).post('/api/auth/register').send(validBody)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 for a malformed/garbage bearer token', async () => {
    const fetchMock = mockUpstream(201, { admin: { id: 'x', name: 'x', email: 'x' } })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send(validBody)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 for an expired token', async () => {
    const fetchMock = mockUpstream(201, { admin: { id: 'x', name: 'x', email: 'x' } })
    const expired = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, TEST_SECRET, { expiresIn: -10 })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${expired}`)
      .send(validBody)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 for a token whose role claim is not "admin"', async () => {
    const fetchMock = mockUpstream(201, { admin: { id: 'x', name: 'x', email: 'x' } })
    const notAdmin = sign({ sub: 'someone', role: 'customer' })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${notAdmin}`)
      .send(validBody)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 for a token signed with the wrong secret', async () => {
    const fetchMock = mockUpstream(201, { admin: { id: 'x', name: 'x', email: 'x' } })
    const wrongSecret = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, 'not-the-real-secret', {
      expiresIn: '1h',
    })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${wrongSecret}`)
      .send(validBody)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards with 201 when a valid Admin token is presented', async () => {
    mockUpstream(201, { admin: { id: 'new-uuid', name: 'New Admin', email: 'new-admin@example.com' } })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign()}`)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://user.test:4002/api/auth/register')
  })

  it('strips a client-supplied x-internal-admin header and derives it only from the verified token', async () => {
    mockUpstream(201, { admin: { id: 'new-uuid', name: 'New Admin', email: 'new-admin@example.com' } })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign({ sub: 'real-admin-uuid', role: 'admin' })}`)
      .set('x-internal-admin', 'spoofed-super-admin-id')
      .send(validBody)

    expect(res.status).toBe(201)
    expect(calls[0].headers['x-internal-admin']).toBe('real-admin-uuid')
    expect(calls[0].headers['x-internal-admin']).not.toBe('spoofed-super-admin-id')
  })

  it('does not relay extra body fields (e.g. role, isSuperAdmin) upstream beyond name/email/password', async () => {
    mockUpstream(201, { admin: { id: 'new-uuid', name: 'New Admin', email: 'new-admin@example.com' } })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign()}`)
      .send({ ...validBody, role: 'super-admin', isSuperAdmin: true, passwordHash: 'x' })

    expect(res.status).toBe(201)
    expect(calls[0].body).toEqual({
      name: validBody.name,
      email: validBody.email,
      password: validBody.password,
    })
  })

  it('never echoes the submitted password back in any response body', async () => {
    mockUpstream(201, { admin: { id: 'new-uuid', name: 'New Admin', email: 'new-admin@example.com' } })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign()}`)
      .send(validBody)

    expect(JSON.stringify(res.body)).not.toContain(validBody.password)
  })

  it('POST /api/auth/login stays public (unaffected by the register gate)', async () => {
    mockUpstream(200, { token: 'a.b.c', admin: { id: 'admin-uuid', email: 'admin@example.com' } })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'whatever12' })

    expect(res.status).toBe(200)
  })

  it('a duplicate-email 409 from upstream never reveals which account already owns the address', async () => {
    mockUpstream(409, { error: 'ignored upstream detail that should not leak verbatim' })

    const res = await request(createApp())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${sign()}`)
      .send(validBody)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('An account with that email already exists')
  })
})

// ---------------------------------------------------------------------------
// user-service: the actual account-creation logic.
//
// This service's own test suite (api/auth/auth.register.test.ts) establishes
// the pattern followed here: no real Mongo instance is available in this
// workspace, so `Admin.findOne` / `Admin.create` / `Admin.countDocuments` are
// stubbed with a tiny in-memory fake collection. Real `bcryptjs` hashing runs
// unmocked, so a stored hash is a genuine bcrypt hash and a subsequent login
// through the real `login()` service genuinely verifies it — only the Mongo
// driver calls themselves are faked.
// ---------------------------------------------------------------------------
describe('user-service: POST /api/auth/register (ADMINDAS-SEC)', () => {
  let createApp: typeof import('../../../backend/user-service/api/app.ts').createApp
  let Admin: typeof import('../../../backend/user-service/api/models/admin.model.ts').Admin

  beforeAll(async () => {
    ;({ createApp } = await import('../../../backend/user-service/api/app.ts'))
    ;({ Admin } = await import('../../../backend/user-service/api/models/admin.model.ts'))
    // Mutated directly (mirrors api/lib/jwt.test.ts) rather than via
    // process.env, since config.ts reads process.env once at import time.
    const { config } = await import('../../../backend/user-service/api/lib/config.ts')
    config.jwtSecret = 'test-secret-for-admin-staff-accounts-security-tests'
  })

  type FakeRecord = { uuid: string; name: string; email: string; passwordHash: string }
  let store: Map<string, FakeRecord>
  let findOneCalls: unknown[]

  beforeEach(() => {
    store = new Map()
    findOneCalls = []

    vi.spyOn(Admin, 'findOne').mockImplementation(((filter: Record<string, unknown>) => {
      findOneCalls.push(filter)
      const email = filter?.email
      // Mirrors a real Mongoose/Mongo query: a non-string filter value is not
      // silently coerced. The route's own validation is expected to reject a
      // non-string email with 400 BEFORE this is ever reached — these tests
      // confirm that by asserting `findOneCalls` stays empty.
      const result = typeof email === 'string' ? (store.get(email) ?? null) : null
      return { exec: () => Promise.resolve(result), then: (r: (v: unknown) => void) => r(result) } as never
    }) as never)

    vi.spyOn(Admin, 'create').mockImplementation((async (doc: Record<string, unknown>) => {
      const email = String(doc.email)
      if (store.has(email)) {
        const err = new Error('E11000 duplicate key error') as Error & { code: number }
        err.code = 11000
        throw err
      }
      const record: FakeRecord = {
        uuid: `uuid-${store.size + 1}`,
        name: String(doc.name),
        email,
        passwordHash: String(doc.passwordHash),
      }
      store.set(email, record)
      return record
    }) as never)

    vi.spyOn(Admin, 'countDocuments').mockImplementation((async (filter: Record<string, unknown>) => {
      const email = filter?.email
      return typeof email === 'string' && store.has(email) ? 1 : 0
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const app = () => createApp()

  it('rejects a non-string email object (NoSQL injection attempt via $ne) with 400 and never reaches the query layer', async () => {
    store.set('seed@example.com', {
      uuid: 'seed-uuid',
      name: 'Seeded Admin',
      email: 'seed@example.com',
      passwordHash: '$2a$10$T6wLSHP2XOR6AtkpQTETa.aAAAkkv8GFjTzoLTG0shvx2QncAOXNG',
    })

    const res = await request(app())
      .post('/api/auth/register')
      .send({ name: 'Attacker', email: { $ne: null }, password: 'somepassword1' })

    expect(res.status).toBe(400)
    // The malformed filter must never even reach Admin.findOne — validation
    // rejects it first. If this ever fires, an object made it into a Mongo
    // query, which is the injection vector this test guards against.
    expect(findOneCalls).toHaveLength(0)
  })

  it('does not allow the caller to set passwordHash, uuid or role via the request body (mass assignment)', async () => {
    const res = await request(app()).post('/api/auth/register').send({
      name: 'New Admin',
      email: 'mass-assign@example.com',
      password: 'a-real-password1',
      passwordHash: 'attacker-controlled-hash',
      uuid: '11111111-1111-1111-1111-111111111111',
      role: 'super-admin',
      isSuperAdmin: true,
    })

    expect(res.status).toBe(201)
    expect(res.body.admin.id).not.toBe('11111111-1111-1111-1111-111111111111')
    expect(res.body.admin).not.toHaveProperty('passwordHash')
    expect(res.body.admin).not.toHaveProperty('role')

    const stored = store.get('mass-assign@example.com')
    expect(stored?.passwordHash).not.toBe('attacker-controlled-hash')
    // The stored hash must actually be a bcrypt hash of the submitted password.
    expect(String(stored?.passwordHash)).toMatch(/^\$2[aby]\$/)
  })

  it('never returns the password or password hash in the 201 response', async () => {
    const res = await request(app()).post('/api/auth/register').send({
      name: 'New Admin',
      email: 'no-leak@example.com',
      password: 'super-secret-password',
    })

    expect(res.status).toBe(201)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('super-secret-password')
    expect(serialized.toLowerCase()).not.toContain('hash')
  })

  it('rejects a duplicate email with 409 and does not create a second account', async () => {
    await request(app()).post('/api/auth/register').send({
      name: 'First',
      email: 'dup@example.com',
      password: 'first-password1',
    })

    const res = await request(app()).post('/api/auth/register').send({
      name: 'Second',
      email: 'DUP@example.com', // case-variant of the same address
      password: 'second-password1',
    })

    expect(res.status).toBe(409)
    expect(store.size).toBe(1)
  })

  it('resolves a create()-level duplicate key error (E11000) to 409, not a 500 or a second account', async () => {
    // Simulates two requests racing past the findOne pre-check before either
    // insert lands: the service's own catch on Admin.create's error.code ===
    // 11000 is what turns the loser into a clean 409 instead of an unhandled
    // 500 or, worse, a silently accepted duplicate account.
    store.set('race@example.com', {
      uuid: 'already-inserted',
      name: 'Racer',
      email: 'race@example.com',
      passwordHash: '$2a$10$T6wLSHP2XOR6AtkpQTETa.aAAAkkv8GFjTzoLTG0shvx2QncAOXNG',
    })
    // Force findOne to report "not found" for this one call, as it would for
    // the loser of a real race that reads before the winner's insert commits.
    vi.mocked(Admin.findOne).mockImplementationOnce((() => ({
      then: (r: (v: unknown) => void) => r(null),
    })) as never)

    const res = await request(app()).post('/api/auth/register').send({
      name: 'Racer',
      email: 'race@example.com',
      password: 'racer-password1',
    })

    expect(res.status).toBe(409)
    expect(store.size).toBe(1)
  })

  it('rejects a password under the minimum length with 400 and creates no account', async () => {
    const res = await request(app()).post('/api/auth/register').send({
      name: 'Weak Password',
      email: 'weak@example.com',
      password: 'short',
    })

    expect(res.status).toBe(400)
    expect(store.has('weak@example.com')).toBe(false)
  })

  it('a newly created account can log in immediately with the standard admin role claim only', async () => {
    await request(app()).post('/api/auth/register').send({
      name: 'Logs In',
      email: 'logs-in@example.com',
      password: 'a-real-password1',
    })

    const res = await request(app()).post('/api/auth/login').send({
      identifier: 'logs-in@example.com',
      password: 'a-real-password1',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    // Shape per api/lib/jwt.ts's AuthTokenPayload: `roles: string[]`, not a
    // single `role` string — matched here exactly so a future change that
    // slips in an extra elevated claim (e.g. `isSuperAdmin`) is caught.
    const decoded = jwt.decode(res.body.token) as Record<string, unknown>
    expect(decoded.roles).toEqual(['admin'])
    expect(decoded).not.toHaveProperty('isSuperAdmin')
  })
})
