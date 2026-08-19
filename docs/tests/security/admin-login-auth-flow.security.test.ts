/**
 * Security tests for ADMINLOG-SEC (plan 011 — Admin Login page and auth flow).
 *
 * Scope: `POST /api/auth/login` on both `user-service` (issuer) and
 * `api-gateway` (proxy), and `api-gateway`'s `verifyJwt` middleware (the
 * guard every future Admin route depends on).
 *
 * Run from each service's own workspace so `node_modules` resolves, e.g.:
 *   cd backend/user-service && npx vitest run ../../docs/tests/security/admin-login-auth-flow.security.test.ts
 *   cd backend/api-gateway && npx vitest run ../../docs/tests/security/admin-login-auth-flow.security.test.ts
 *
 * This file is split into two `describe` blocks that each dynamically import
 * only the modules that live in the workspace vitest is actually run from,
 * because user-service and api-gateway are separate npm workspaces with
 * separate node_modules and cannot both be imported in one process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { existsSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../../..')
void repoRoot

const runningInUserService = existsSync(path.join(process.cwd(), 'api/auth/auth.routes.ts'))
const runningInGateway = existsSync(path.join(process.cwd(), 'api/auth-proxy/auth-proxy.routes.ts'))

const TEST_SECRET = 'test-secret-shared-across-both-services'

// ---------------------------------------------------------------------------
// user-service: POST /api/auth/login — issuer-side checks not already pinned
// by backend/user-service/api/auth/auth.test.ts
// ---------------------------------------------------------------------------
describe.runIf(runningInUserService)('security: user-service POST /api/auth/login', () => {
  let createApp: () => import('express').Express
  let Admin: { findOne: (...args: unknown[]) => unknown }
  let config: { jwtSecret: string; jwtExpiresIn: string }

  const TEST_PASSWORD = 'correct-horse-battery-staple'
  const TEST_EMAIL = 'admin@example.com'
  const TEST_UUID = '3d0f1a2b-4c5d-4e6f-8091-a2b3c4d5e6f7'
  let passwordHash: string

  beforeEach(async () => {
    ;({ createApp } = await import('../../../backend/user-service/api/app.ts'))
    ;({ Admin } = await import('../../../backend/user-service/api/models/admin.model.ts'))
    ;({ config } = await import('../../../backend/user-service/api/lib/config.ts'))
    config.jwtSecret = TEST_SECRET
    config.jwtExpiresIn = '24h'
    passwordHash = await bcrypt.hash(TEST_PASSWORD, 4)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function stubAdminLookup(doc: unknown) {
    return vi.spyOn(Admin, 'findOne').mockResolvedValue(doc as never)
  }

  it('signs a token whose payload has NO "sub"/"role" claims — see gateway cross-service test below', async () => {
    // This test does not assert a pass/fail security property on its own; it
    // pins the exact shape user-service currently signs, so the mismatch
    // demonstrated in the gateway describe block below is reproducible and
    // does not silently drift if either side is edited independently.
    stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })

    const decoded = jwt.decode(res.body.token) as Record<string, unknown>
    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'roles', 'userId'])
    expect(decoded.sub).toBeUndefined()
    expect(decoded.role).toBeUndefined()
  })

  it('does not let a NoSQL-operator identifier reach the Admin filter', async () => {
    const findOne = stubAdminLookup({ uuid: TEST_UUID, email: TEST_EMAIL, passwordHash })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: { $gt: '' }, password: TEST_PASSWORD })

    expect(res.status).toBe(400)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('still runs the timing-equalizer bcrypt compare against a non-empty hash for an unknown account', async () => {
    // Loose smoke test for the timing equalizer (bcrypt.compare always runs
    // against a real hash, never short-circuited). Not a precise timing-attack
    // proof — that needs statistical sampling outside a unit-test budget —
    // but catches a regression where the equalizer compare is skipped.
    stubAdminLookup(null)
    const compareSpy = vi.spyOn(bcrypt, 'compare')

    await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: TEST_PASSWORD })

    expect(compareSpy).toHaveBeenCalledTimes(1)
    expect(compareSpy.mock.calls[0][1]).not.toBe('')
  })

  it('rejects a login body carrying a __proto__ key rather than crashing or matching', async () => {
    const findOne = stubAdminLookup(null)

    const res = await request(createApp())
      .post('/api/auth/login')
      .send(JSON.parse('{"identifier":"admin@example.com","password":"x","__proto__":{"isAdmin":true}}'))

    // Either 401 (normal invalid-credentials path) or 400 is acceptable —
    // what must NOT happen is a 200/500 caused by prototype pollution.
    expect([400, 401]).toContain(res.status)
    findOne.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// api-gateway: verifyJwt + the cross-service integration the unit suites miss
// ---------------------------------------------------------------------------
describe.runIf(runningInGateway)('security: api-gateway verifyJwt cross-service integration', () => {
  let verifyJwt: (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => void
  let config: { jwtSecret: string }

  beforeEach(async () => {
    process.env.JWT_SECRET = TEST_SECRET
    ;({ verifyJwt } = await import('../../../backend/api-gateway/api/routing/routing.middleware.ts'))
    ;({ config } = await import('../../../backend/api-gateway/api/lib/config.ts'))
    config.jwtSecret = TEST_SECRET
  })

  async function guardedApp() {
    const express = (await import('express')).default
    const app = express()
    app.use(express.json())
    app.get('/api/protected', verifyJwt, (req, res) => {
      res.status(200).json({ admin: req.admin })
    })
    return app
  }

  it(
    'CRITICAL: rejects a token freshly issued by user-service\'s real signAuthToken() with 401, ' +
      'even though the credentials were correct and the shared secret matches — ' +
      'the sign side emits {userId, roles} but the verify side requires {sub, role}, ' +
      'so no admin can ever pass verifyJwt with a token this system actually issues',
    async () => {
      // Import user-service's REAL signing function (not a hand-built {sub,
      // role} payload like routing.middleware.test.ts uses) to reproduce
      // exactly what a real login response contains.
      const { signAuthToken } = await import('../../../backend/user-service/api/lib/jwt.ts')
      const userServiceConfig = (
        await import('../../../backend/user-service/api/lib/config.ts')
      ).config
      userServiceConfig.jwtSecret = TEST_SECRET

      const token = signAuthToken({ userId: 'a-real-admin-uuid', roles: ['admin'] })

      const res = await request(await guardedApp())
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`)

      // This assertion documents the CURRENT (broken) behavior. It is
      // intentionally an `expect(...).toBe(401)` — i.e. it currently PASSES
      // because the bug exists. If it starts failing, the sign/verify claim
      // shapes have been reconciled and this test (and the report finding)
      // should be updated/removed rather than "fixed" to expect 401 again.
      expect(res.status).toBe(401)
    },
  )

  it('rejects an "alg: none" token as invalid (algorithm confusion is closed)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'x', role: 'admin' })).toString('base64url')
    const noneToken = `${header}.${payload}.`

    const res = await request(await guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${noneToken}`)

    expect(res.status).toBe(401)
  })

  it('rejects a token with a tampered signature rather than 500ing', async () => {
    const forged = jwt.sign({ sub: 'x', role: 'admin' }, TEST_SECRET, { algorithm: 'HS256' })
    const tampered = forged.slice(0, -4) + 'AAAA' // corrupt the signature

    const res = await request(await guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${tampered}`)

    expect(res.status).toBe(401)
  })

  it('fails closed (401, not 200) when JWT_SECRET is unset rather than accepting any token', async () => {
    config.jwtSecret = ''
    const token = jwt.sign({ sub: 'x', role: 'admin' }, 'irrelevant', { expiresIn: '1h' })

    const res = await request(await guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// api-gateway: POST /api/auth/login proxy — additional edge cases beyond
// backend/api-gateway/api/auth-proxy/auth-proxy.test.ts
// ---------------------------------------------------------------------------
describe.runIf(runningInGateway)('security: api-gateway login proxy — header injection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not forward client-supplied headers (e.g. a spoofed x-internal-admin) to user-service', async () => {
    const { createApp } = await import('../../../backend/api-gateway/api/app.ts')
    let sentHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentHeaders = (init?.headers as Record<string, string>) ?? {}
        return new Response(JSON.stringify({ token: 't', admin: { id: 'x', email: 'a@b.c' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )

    await request(createApp())
      .post('/api/auth/login')
      .set('x-internal-admin', 'attacker-controlled')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(sentHeaders['x-internal-admin']).toBeUndefined()
  })

  it('handles a CRLF-shaped identifier as an ordinary rejected login rather than crashing', async () => {
    const { createApp } = await import('../../../backend/api-gateway/api/app.ts')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 })),
    )

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com\r\nX-Injected: 1', password: 'pw' })

    // The gateway relays this to user-service as a JSON body field (not a
    // header), so CRLF has no special meaning here — this test pins that
    // the request is still handled as an ordinary (rejected) login rather
    // than crashing the handler.
    expect([200, 401]).toContain(res.status)
  })
})
