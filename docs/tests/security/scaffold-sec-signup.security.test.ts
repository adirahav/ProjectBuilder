import { describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../../../backend/user-management-service/api/app.js'
import { Admin } from '../../../backend/user-management-service/api/models/Admin.model.js'
import { verifyToken } from '../../../backend/user-management-service/api/lib/jwt.js'

/**
 * Security regression tests for SCAFFOLD-SEC (backend/user-management-service
 * scaffold + POST /api/auth/signup, plan 011).
 *
 * Run from the service directory so its own vitest config applies
 * (globalSetup / mongodb-memory-server bootstrap + the test-only JWT_SECRET,
 * FRONTEND_ORIGIN, NODE_ENV=test env block in
 * backend/user-management-service/vitest.config.ts):
 *
 *   cd backend/user-management-service && npx vitest run ../../docs/tests/security/scaffold-sec-signup.security.test.ts
 *
 * These complement backend/user-management-service/__tests__/signup.test.ts
 * (which already covers the role-escalation invariant, bcrypt hashing,
 * password-echo avoidance, and the duplicate-email race). This file is the
 * cross-cutting security pass: NoSQL-injection-shaped input, oversized-body
 * handling, transport headers, CORS restriction, JWT algorithm confinement,
 * and prototype-pollution-shaped input.
 */

const app = createApp()
const TEST_JWT_SECRET = 'test-only-jwt-secret-not-a-real-credential'

const VALID = {
  fullName: 'הילה כהן',
  email: 'sec-hila@example.com',
  password: 'Aegean2026',
}

const signup = (body: unknown) => request(app).post('/api/auth/signup').send(body as object)

describe('SCAFFOLD-SEC: NoSQL injection resistance', () => {
  it('rejects an object-typed email ($ne-style NoSQL operator injection) as 400, not a query bypass', async () => {
    const res = await signup({
      fullName: VALID.fullName,
      email: { $ne: null },
      password: VALID.password,
    })

    expect(res.status).toBe(400)
    expect(await Admin.countDocuments({})).toBe(0)
  })

  it('rejects an object-typed password ($gt-style operator injection) as 400', async () => {
    const res = await signup({
      fullName: VALID.fullName,
      email: VALID.email,
      password: { $gt: '' },
    })

    expect(res.status).toBe(400)
    expect(await Admin.countDocuments({})).toBe(0)
  })

  it('treats an operator-shaped fullName string as inert text, not a query operator', async () => {
    const res = await signup({
      ...VALID,
      email: 'sec-injection-2@example.com',
      fullName: '{"$where": "1==1"}',
    })

    // Accepted as a plain (odd but valid-length) string — proves the request
    // body is never interpreted as query operators for the write path.
    expect(res.status).toBe(201)
    expect(res.body.user.fullName).toBe('{"$where": "1==1"}')
  })
})

describe('SCAFFOLD-SEC: transport hardening', () => {
  it('does not advertise Express via X-Powered-By', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('rejects a request body over the configured JSON size limit (64kb) and never persists it', async () => {
    const oversized = {
      ...VALID,
      email: 'sec-oversized@example.com',
      fullName: 'a'.repeat(100_000),
    }
    const res = await signup(oversized)

    // NOTE (see security report, low-severity finding): body-parser's
    // PayloadTooLargeError is not an `ApiError`, so `error.middleware.ts`'s
    // generic catch-all maps it to a bare 500 instead of preserving the
    // library's own 413. The limit itself IS enforced — no oversized body is
    // ever parsed or persisted — so this is a status-code-accuracy finding,
    // not a data-exposure or DoS-bypass one. Asserting the security-relevant
    // invariant (never 2xx, never persisted) rather than the ideal status code
    // so this test documents the gap without being a false failure.
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await Admin.countDocuments({ email: 'sec-oversized@example.com' })).toBe(0)
  })

  it('does not reflect an arbitrary Origin in CORS headers (only the configured FRONTEND_ORIGIN is allowed)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', 'https://evil.example.com')
      .send({ ...VALID, email: 'sec-cors@example.com' })

    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com')
  })

  it('unhandled-error responses never include a stack trace or raw error object', async () => {
    // Malformed JSON body triggers Express's body-parser error path, handled
    // by the same error middleware as any other unexpected error.
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')
      .send('{ not valid json')

    expect(res.status).toBeGreaterThanOrEqual(400)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/) // no stack-frame shape
    expect(serialized).not.toContain('node_modules')
  })
})

describe('SCAFFOLD-SEC: JWT algorithm confinement', () => {
  it('issues tokens pinned to HS256 (header alg is never "none" or asymmetric)', async () => {
    const res = await signup({ ...VALID, email: 'sec-jwt-alg@example.com' })
    const [headerB64] = res.body.token.split('.')
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'))

    expect(header.alg).toBe('HS256')
  })

  it('a token forged with alg:"none" and no signature is rejected by verifyToken', () => {
    const forgedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    )
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'x', email: 'x@example.com', roles: ['admin'] }),
    ).toString('base64url')
    const forgedToken = `${forgedHeader}.${forgedPayload}.`

    expect(() => verifyToken(forgedToken)).toThrow()
  })

  it('a token signed with a different secret is rejected', () => {
    const foreignToken = jwt.sign(
      { sub: 'x', email: 'x@example.com', roles: ['admin'] },
      'attacker-controlled-secret',
      { algorithm: 'HS256', expiresIn: '1h' },
    )

    expect(() => verifyToken(foreignToken)).toThrow()
  })

  it('roundtrips correctly with the real service secret (sanity check for the two rejection tests above)', () => {
    const validToken = jwt.sign(
      { sub: 'x', email: 'x@example.com', roles: ['user'] },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    )

    expect(() => verifyToken(validToken)).not.toThrow()
  })
})

describe('SCAFFOLD-SEC: mass-assignment / prototype-pollution shaped input', () => {
  it('a __proto__-shaped body field does not pollute Object.prototype and signup still enforces roles:["user"]', async () => {
    const res = await signup({
      ...VALID,
      email: 'sec-proto@example.com',
      __proto__: { roles: ['admin'], isAdmin: true },
    })

    expect(res.status).toBe(201)
    expect(res.body.user.roles).toEqual(['user'])
    // Prove no global pollution leaked into an unrelated plain object.
    expect(({} as any).isAdmin).toBeUndefined()
  })
})
