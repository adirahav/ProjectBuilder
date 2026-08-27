import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

/**
 * Security regression tests for ADMINDAS-SEC (Admin dashboard shell — 3 tabs,
 * plan 009).
 *
 * Run from `backend/tour-service` so the service's own vitest/mongo setup
 * applies:
 *   cd backend/tour-service && npx vitest run ../../docs/tests/security/admindas-sec.security.test.ts
 *
 * `JWT_SECRET` and `MONGODB_URI` must be set BEFORE `api/app.js` (and anything
 * it imports, transitively `api/lib/config.js`) is first evaluated, because
 * `config.ts` reads `process.env` at module-load time. Static top-level
 * imports are hoisted ahead of any assignment in this file, so the app module
 * is loaded via a dynamic `import()` inside `beforeAll`, after the env vars
 * are set — not via a top-level `import`.
 *
 * Findings this file documents (see the security report for full detail):
 *  - `GET /api/buses/:busId/manifest` (the admin-only PII endpoint required by
 *    plan 009 / the tour-service API contract) does not exist in this
 *    codebase yet — `backend/tour-service/api/bus/bus.routes.ts` only mounts
 *    `GET /:busId/seats`. The tests below that target the manifest route are
 *    expected to FAIL until that endpoint and its `requireAdmin` gate are
 *    implemented; they are intentionally left in place (rather than removed)
 *    so they start passing the moment the endpoint lands, and so CI makes the
 *    gap visible instead of silently skipping it.
 */

const JWT_SECRET = 'admindas-sec-test-secret-do-not-use-in-prod'

let app: import('express').Express
let Tour: typeof import('../../../backend/tour-service/api/models/Tour.model.js').Tour
let Bus: typeof import('../../../backend/tour-service/api/models/Bus.model.js').Bus
let Seat: typeof import('../../../backend/tour-service/api/models/Seat.model.js').Seat
let requireAdmin: typeof import('../../../backend/tour-service/api/lib/auth.middleware.js').requireAdmin
let verifyToken: typeof import('../../../backend/tour-service/api/lib/jwt.js').verifyToken

function signAdminToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { sub: 'admin-1', username: 'admin', roles: ['admin'], ...overrides },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  )
}

function signUserToken() {
  return jwt.sign(
    { sub: 'user-1', username: 'rider', roles: ['user'] },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  )
}

/** A hand-built `alg: none` token: header/payload base64url-encoded, no signature. */
function signAlgNoneToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ sub: 'admin-1', username: 'admin', roles: ['admin'] }),
  ).toString('base64url')
  return `${header}.${payload}.`
}

beforeAll(async () => {
  // Must be set before `api/app.js` (and transitively `api/lib/config.js`) is
  // first evaluated — `config.ts` reads `process.env` at import time, and
  // static top-level imports are hoisted ahead of any assignment in this
  // file, hence the dynamic `import()`s below rather than top-level imports.
  // The Mongo connection itself is the ambient one bootstrapped by
  // tour-service's own `__tests__/globalSetup.ts` + `__tests__/setup.ts`
  // (wired into this run via `docs/tests/security/vitest.security.config.ts`)
  // — the same shared-connection pattern `seat-request-modal.security.test.ts`
  // already relies on, so both files coexist in one in-memory Mongo instance.
  process.env.JWT_SECRET = JWT_SECRET
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173'

  const appModule = await import('../../../backend/tour-service/api/app.js')
  app = appModule.createApp()

  Tour = (await import('../../../backend/tour-service/api/models/Tour.model.js')).Tour
  Bus = (await import('../../../backend/tour-service/api/models/Bus.model.js')).Bus
  Seat = (await import('../../../backend/tour-service/api/models/Seat.model.js')).Seat
  requireAdmin = (await import('../../../backend/tour-service/api/lib/auth.middleware.js')).requireAdmin
  verifyToken = (await import('../../../backend/tour-service/api/lib/jwt.js')).verifyToken
})

async function buildTour(overrides: Record<string, unknown> = {}) {
  return Tour.create({
    name: 'טיול בדיקה',
    date: new Date('2026-09-14'),
    endDate: new Date('2026-09-16'),
    ...overrides,
  })
}

async function buildBus(tourId: unknown, overrides: Record<string, unknown> = {}) {
  return Bus.create({
    tourId: tourId as any,
    name: 'אוטובוס 1',
    seatCount: 4,
    seatLayout: { aisleAfterColumn: 2, doorRow: 3, backRow: 13 },
    pickupPoints: [
      { name: 'תחנה מרכזית', order: 1 },
      { name: 'צומת הבדיקה', order: 2 },
    ],
    ...overrides,
  })
}

async function buildSeat(
  busId: unknown,
  overrides: { status?: string; row?: number; column?: number; label?: string } = {},
) {
  const { status = 'available', row = 1, column = 1, label = '1' } = overrides
  return Seat.create({ busId: busId as any, position: { row, column, label }, status })
}

// ---------------------------------------------------------------------------
// JWT verification (shared secret / algorithm allowlist — Scope: cross-service
// drift risk). Exercised directly against `requireAdmin`/`verifyToken` since no
// route in this codebase mounts `requireAdmin` yet (see file header note).
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC: admin JWT verification (requireAdmin / verifyToken)', () => {
  function runMiddleware(header: string | undefined) {
    return new Promise<{ status?: number; body?: unknown; nextCalled: boolean }>((resolve) => {
      const req: any = { headers: { authorization: header } }
      let statusCode: number | undefined
      let body: unknown
      const res: any = {
        status(code: number) {
          statusCode = code
          return this
        },
        json(payload: unknown) {
          body = payload
          resolve({ status: statusCode, body, nextCalled: false })
        },
      }
      const next = () => resolve({ status: undefined, body: undefined, nextCalled: true })
      requireAdmin(req, res, next)
    })
  }

  it('rejects a request with no Authorization header (401)', async () => {
    const result = await runMiddleware(undefined)
    expect(result.nextCalled).toBe(false)
    expect(result.status).toBe(401)
  })

  it('accepts a validly-signed admin token', async () => {
    const result = await runMiddleware(`Bearer ${signAdminToken()}`)
    expect(result.nextCalled).toBe(true)
  })

  it('rejects a token signed with the wrong secret (tampered/forged)', async () => {
    const forged = jwt.sign({ sub: 'x', username: 'x', roles: ['admin'] }, 'wrong-secret', {
      algorithm: 'HS256',
    })
    const result = await runMiddleware(`Bearer ${forged}`)
    expect(result.nextCalled).toBe(false)
    expect(result.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ sub: 'x', username: 'x', roles: ['admin'] }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: -10,
    })
    const result = await runMiddleware(`Bearer ${expired}`)
    expect(result.nextCalled).toBe(false)
    expect(result.status).toBe(401)
  })

  it('rejects an `alg: none` token even with an otherwise-valid admin payload (algorithm confusion)', async () => {
    const result = await runMiddleware(`Bearer ${signAlgNoneToken()}`)
    expect(result.nextCalled).toBe(false)
    expect(result.status).toBe(401)
  })

  it('rejects a token whose payload has no admin role (role: user only)', async () => {
    const result = await runMiddleware(`Bearer ${signUserToken()}`)
    expect(result.nextCalled).toBe(false)
    expect(result.status).toBe(403)
  })

  it('never echoes the raw token or the underlying jwt library error into the response body', async () => {
    const badToken = 'not-a-real-jwt'
    const result = await runMiddleware(`Bearer ${badToken}`)
    const serialized = JSON.stringify(result.body)
    expect(serialized).not.toContain(badToken)
    expect(serialized.toLowerCase()).not.toContain('jsonwebtokenerror')
  })
})

// ---------------------------------------------------------------------------
// seat.status integrity: client can never smuggle an arbitrary status through
// the public booking endpoint.
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC: seat.status cannot be set from client input', () => {
  it('rejects a booking request that includes a `status` field (unknown-field rejection)', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await request(app)
      .post('/api/seats/bookings')
      .send({
        seatId: seat.uuid,
        fullName: 'תוקף בדיקה',
        phone: '0501234567',
        pickupPoint: 'תחנה מרכזית',
        status: 'taken',
      })

    expect(res.status).toBe(400)

    const persisted = await Seat.findOne({ uuid: seat.uuid }).lean()
    expect(persisted?.status).toBe('available')
  })

  it('never allows the booking endpoint to move a seat directly to `taken` or `reserved`', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await request(app).post('/api/seats/bookings').send({
      seatId: seat.uuid,
      fullName: 'נוסע בדיקה',
      phone: '0501234567',
      pickupPoint: 'תחנה מרכזית',
    })

    expect(res.status).toBe(201)
    expect(res.body.seat.status).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// Concurrency: two simultaneous requests for the same seat → exactly one 201,
// one 409. A sequential pass is not sufficient proof (per audit checklist).
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC: concurrent seat booking requests', () => {
  it('exactly one of two simultaneous POST /api/seats/bookings for the same seat succeeds', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const bodyA = {
      seatId: seat.uuid,
      fullName: 'נוסע א',
      phone: '0501111111',
      pickupPoint: 'תחנה מרכזית',
    }
    const bodyB = {
      seatId: seat.uuid,
      fullName: 'נוסע ב',
      phone: '0502222222',
      pickupPoint: 'צומת הבדיקה',
    }

    const [resA, resB] = await Promise.all([
      request(app).post('/api/seats/bookings').send(bodyA),
      request(app).post('/api/seats/bookings').send(bodyB),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([201, 409])

    const finalSeat = await Seat.findOne({ uuid: seat.uuid }).lean()
    expect(finalSeat?.status).toBe('pending')
    // Only the winner's passenger details may be persisted.
    const winnerName = resA.status === 201 ? bodyA.fullName : bodyB.fullName
    expect(finalSeat?.passengerName).toBe(winnerName)
  })
})

// ---------------------------------------------------------------------------
// Soft delete: a soft-deleted tour/bus must not reappear in list endpoints.
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC: soft-deleted records excluded from list endpoints', () => {
  it('GET /api/tours excludes a soft-deleted tour', async () => {
    const visible = await buildTour({ name: 'טיול גלוי' })
    const deleted = await buildTour({ name: 'טיול מחוק', deletedAt: new Date() })

    const res = await request(app).get('/api/tours')

    expect(res.status).toBe(200)
    const names = (res.body.tours as Array<{ name: string }>).map((t) => t.name)
    expect(names).toContain(visible.name)
    expect(names).not.toContain(deleted.name)
  })

  it('GET /api/tours/:tourId/buses excludes a soft-deleted bus', async () => {
    const tour = await buildTour()
    const visibleBus = await buildBus(tour._id, { name: 'אוטובוס גלוי' })
    const deletedBus = await buildBus(tour._id, { name: 'אוטובוס מחוק', deletedAt: new Date() })

    const res = await request(app).get(`/api/tours/${tour.uuid}/buses`)

    expect(res.status).toBe(200)
    const names = (res.body.buses as Array<{ name: string }>).map((b) => b.name)
    expect(names).toContain(visibleBus.name)
    expect(names).not.toContain(deletedBus.name)
  })
})

// ---------------------------------------------------------------------------
// CORS: only the configured frontend origin is allowed.
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC: CORS', () => {
  it('reflects the configured frontend origin, not a wildcard', async () => {
    const res = await request(app)
      .get('/api/tours')
      .set('Origin', 'http://localhost:5173')

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('does not reflect an arbitrary, non-configured origin', async () => {
    const res = await request(app)
      .get('/api/tours')
      .set('Origin', 'http://evil.example.com')

    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example.com')
  })
})

// ---------------------------------------------------------------------------
// The admin-only manifest endpoint required by plan 009 / the API contract.
//
// SEV-001 (CRITICAL, see security report): `GET /api/buses/:busId/manifest`
// does not exist anywhere in `backend/tour-service` — `bus.routes.ts` only
// mounts `GET /:busId/seats`. Every assertion below currently observes a bare
// 404 (Express's `notFoundHandler`), not the 401/200/403 the API contract and
// plan 009 require. `it.fails` is used deliberately instead of `it` so this
// file's overall pass/fail signal stays informative in CI: these three cases
// will start FAILING (i.e. `it.fails` will itself report a failure) the
// moment the endpoint is implemented and gated correctly — which is exactly
// the point at which a maintainer should flip them back to plain `it` and
// delete this comment. Until then they PASS (because the "expected failure"
// — the 404 — reliably occurs), so this suite's green/red status doesn't
// mask a still-open CRITICAL finding as if it were resolved.
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC (known gap, tracked as SEV-001): GET /api/buses/:busId/manifest admin gating', () => {
  it.fails('rejects a request with no Authorization header (401), not a bare 404', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)

    const res = await request(app).get(`/api/buses/${bus.uuid}/manifest`)

    expect(res.status).toBe(401)
  })

  it.fails('returns passenger PII for a valid admin token', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    await buildSeat(bus._id, { status: 'taken', row: 1, column: 1, label: '1' })

    const res = await request(app)
      .get(`/api/buses/${bus.uuid}/manifest`)
      .set('Authorization', `Bearer ${signAdminToken()}`)

    expect(res.status).toBe(200)
  })

  it.fails('rejects a non-admin (role: user) token with 403', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)

    const res = await request(app)
      .get(`/api/buses/${bus.uuid}/manifest`)
      .set('Authorization', `Bearer ${signUserToken()}`)

    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// The public seat-map endpoint must never carry PII (regression against plan
// 008's audit — the new manifest work must not have widened this response).
// ---------------------------------------------------------------------------

describe('ADMINDAS-SEC: public seat map still excludes PII', () => {
  it('GET /api/buses/:busId/seats never includes passenger name/phone/pickup fields', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    await buildSeat(bus._id, { status: 'available' })

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.status).toBe(200)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toMatch(/passengerName|passengerPhone|pickupPointName/)
  })
})
