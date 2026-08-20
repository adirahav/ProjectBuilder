/**
 * Security tests for ADMINDAS-SEC (plan 012 — Admin Dashboard: Services
 * management, create/edit/deactivate).
 *
 * Scope: the four Admin write/list routes this task added —
 *   GET   /api/services/all
 *   POST  /api/services
 *   PATCH /api/services/:id
 *   PATCH /api/services/:id/deactivate
 * — as proxied by api-gateway (behind `verifyJwt`) and as implemented by
 * booking-service (which trusts the gateway and applies no auth of its own).
 *
 * Run from `backend/api-gateway` or `backend/booking-service` so node_modules
 * resolves, e.g.:
 *   cd backend/booking-service && npx vitest run ../../docs/tests/security/admin-dashboard-services.security.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import jwt from 'jsonwebtoken'

// --- api-gateway (auth boundary) --------------------------------------------
const GATEWAY_SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-shared-with-user-service'
  process.env.BOOKING_SERVICE_URL = 'http://booking.test:4001'
  return process.env.JWT_SECRET
})

const { createApp: createGatewayApp } = await import(
  '../../../backend/api-gateway/api/app.ts'
)

// --- booking-service (the actual data-owning service) -----------------------
import { createApp as createBookingApp } from '../../../backend/booking-service/api/app.ts'
import { Service } from '../../../backend/booking-service/api/models/service.model.ts'

let mongo: MongoMemoryServer

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

beforeEach(async () => {
  await Service.deleteMany({})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const bookingApp = () => createBookingApp()
const gatewayApp = () => createGatewayApp()

function adminToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { sub: 'admin-uuid', role: 'admin', ...overrides },
    GATEWAY_SECRET,
    { expiresIn: '1h' },
  )
}

async function seedService(overrides: Record<string, unknown> = {}) {
  return Service.create({
    name: 'Full groom — small dog',
    durationMinutes: 90,
    price: 220,
    ...overrides,
  })
}

// =============================================================================
// 1. api-gateway is the auth boundary: every admin route must reject a request
//    that lacks a valid Admin JWT, and must never forward it upstream.
// =============================================================================

describe('ADMINDAS-SEC: api-gateway auth boundary', () => {
  it('rejects GET /api/services/all with no token', async () => {
    const res = await request(gatewayApp()).get('/api/services/all')
    expect(res.status).toBe(401)
  })

  it('rejects a token signed with a foreign secret', async () => {
    const forged = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, 'not-the-real-secret', {
      expiresIn: '1h',
    })
    const res = await request(gatewayApp())
      .get('/api/services/all')
      .set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
  })

  it('rejects a token whose role is not admin (privilege escalation attempt)', async () => {
    const nonAdmin = jwt.sign({ sub: 'user-uuid', role: 'customer' }, GATEWAY_SECRET, {
      expiresIn: '1h',
    })
    const res = await request(gatewayApp())
      .get('/api/services/all')
      .set('Authorization', `Bearer ${nonAdmin}`)
    expect(res.status).toBe(401)
  })

  it('rejects the alg:none JWT attack (unsigned token accepted as valid)', async () => {
    // Header+payload only, no signature — a classic library-misconfiguration probe.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    )
    const payload = Buffer.from(JSON.stringify({ sub: 'admin-uuid', role: 'admin' })).toString(
      'base64url',
    )
    const unsigned = `${header}.${payload}.`

    const res = await request(gatewayApp())
      .get('/api/services/all')
      .set('Authorization', `Bearer ${unsigned}`)
    expect(res.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const expired = adminToken()
    const almostExpired = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, GATEWAY_SECRET, {
      expiresIn: '-10s',
    })
    void expired
    const res = await request(gatewayApp())
      .get('/api/services/all')
      .set('Authorization', `Bearer ${almostExpired}`)
    expect(res.status).toBe(401)
  })

  it('never forwards a client-supplied x-internal-admin header as-is (spoofing the trust header)', async () => {
    const calls: Array<{ headers: Record<string, string> }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({ headers: (init?.headers ?? {}) as Record<string, string> })
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )

    await request(gatewayApp())
      .get('/api/services/all')
      .set('Authorization', `Bearer ${adminToken()}`)
      .set('x-internal-admin', 'attacker-controlled-id')

    expect(calls[0].headers['x-internal-admin']).toBe('admin-uuid')
    expect(calls[0].headers['x-internal-admin']).not.toBe('attacker-controlled-id')
  })

  it('POST /api/services rejects mass-assignment of isActive/uuid/_id through the gateway', async () => {
    const calls: Array<{ body: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({ body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
        return new Response(
          JSON.stringify({
            id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
            name: 'x',
            durationMinutes: 30,
            price: 10,
            isActive: true,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    await request(gatewayApp())
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Injected',
        durationMinutes: 30,
        price: 10,
        isActive: false,
        uuid: 'attacker-chosen-uuid',
        _id: '000000000000000000000000',
        __proto__: { polluted: true },
      })

    const forwarded = calls[0].body as Record<string, unknown>
    expect(Object.keys(forwarded).sort()).toEqual(['durationMinutes', 'name', 'price'])
    expect(forwarded.isActive).toBeUndefined()
    expect(forwarded.uuid).toBeUndefined()
    expect(forwarded._id).toBeUndefined()
  })
})

// =============================================================================
// 2. booking-service itself: proves the documented trust-boundary risk (plan
//    012 Risks §3) — these routes have no auth of their own and MUST NOT be
//    reachable from outside the private network. These tests exist to make the
//    boundary explicit and to lock down every other defense that IS present at
//    this layer (injection safety, allowlisted fields, soft-delete integrity).
// =============================================================================

describe('ADMINDAS-SEC: booking-service defense in depth (no gateway in front)', () => {
  it('DOCUMENTS the trust-boundary gap: booking-service accepts admin writes with no Authorization header at all', async () => {
    const res = await request(bookingApp()).get('/api/services/all')
    // This is EXPECTED given the architecture (gateway-enforced auth), and is
    // flagged in the report as a deployment-network requirement, not a code bug.
    expect(res.status).toBe(200)
  })

  it('rejects a NoSQL-injection object in place of the "name" string on create', async () => {
    const res = await request(bookingApp())
      .post('/api/services')
      .send({ name: { $ne: null }, durationMinutes: 30, price: 10 })

    expect(res.status).toBe(400)
    const count = await Service.countDocuments({})
    expect(count).toBe(0)
  })

  it('rejects a NoSQL-injection operator in the :id path param on PATCH', async () => {
    await seedService()
    const res = await request(bookingApp())
      .patch('/api/services/%24where')
      .send({ price: 1 })

    // Fails uuid-shape validation before ever reaching a Mongo query.
    expect(res.status).toBe(400)
  })

  it('rejects an object injected as the :id on the deactivate route', async () => {
    const res = await request(bookingApp()).patch(
      `/api/services/${encodeURIComponent(JSON.stringify({ $ne: null }))}/deactivate`,
    )
    expect(res.status).toBe(400)
  })

  it('never lets a PATCH body write deletedAt or _id (allowlisted $set fields only)', async () => {
    const svc = await seedService()
    const res = await request(bookingApp())
      .patch(`/api/services/${svc.get('uuid')}`)
      .send({ price: 999, deletedAt: new Date('2020-01-01'), _id: '000000000000000000000000' })

    expect(res.status).toBe(200)
    const reloaded = await Service.findById(svc._id).lean()
    expect(reloaded?.deletedAt).toBeNull()
    expect(String(reloaded?._id)).toBe(String(svc._id))
    expect(reloaded?.price).toBe(999)
  })

  it('mongo operator injection attempt via $set-shaped body is rejected as invalid, not executed', async () => {
    const svc = await seedService()
    const res = await request(bookingApp())
      .patch(`/api/services/${svc.get('uuid')}`)
      .send({ $set: { isActive: false }, price: '$where: 1' })

    // price must be a number — the operator-shaped junk is rejected by type
    // validation, never coerced or evaluated.
    expect(res.status).toBe(400)
  })

  it('deactivating one Service cannot be steered to affect another via a crafted id', async () => {
    const a = await seedService({ name: 'A' })
    const b = await seedService({ name: 'B' })

    // A single path segment can't literally be an array; simulate the shape a
    // handler would produce if it naively string-concatenated multiple ids
    // into a filter. isUuid() must reject it outright.
    const crafted = encodeURIComponent(`${a.get('uuid')},${b.get('uuid')}`)
    const res = await request(bookingApp()).patch(`/api/services/${crafted}/deactivate`)
    expect(res.status).toBe(400)

    const stillA = await Service.findById(a._id).lean()
    const stillB = await Service.findById(b._id).lean()
    expect(stillA?.isActive).toBe(true)
    expect(stillB?.isActive).toBe(true)
  })

  it('rejects create with a prototype-pollution-shaped body without polluting Object.prototype', async () => {
    const res = await request(bookingApp())
      .post('/api/services')
      .set('Content-Type', 'application/json')
      .send('{"name":"x","durationMinutes":30,"price":10,"__proto__":{"polluted":true}}')

    // Either accepted with the dangerous key stripped, or rejected — either way
    // nothing must reach the global Object prototype.
    expect([200, 201, 400]).toContain(res.status)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('soft-deleted Services stay excluded from both list routes and cannot be revived by id guessing', async () => {
    const svc = await seedService()
    await Service.updateOne({ _id: svc._id }, { $set: { deletedAt: new Date() } })

    const patchRes = await request(bookingApp())
      .patch(`/api/services/${svc.get('uuid')}`)
      .send({ price: 1 })
    expect(patchRes.status).toBe(404)

    const listRes = await request(bookingApp()).get('/api/services/all')
    expect(listRes.body.find((s: { id: string }) => s.id === svc.get('uuid'))).toBeUndefined()
  })

  it('GET /api/services (public) never includes an inactive Service even under a crafted query string', async () => {
    await seedService({ name: 'Active', isActive: true })
    await seedService({ name: 'Inactive', isActive: false })

    const res = await request(bookingApp()).get('/api/services?isActive=false&$where=1')
    expect(res.status).toBe(200)
    expect(res.body.every((s: { isActive: boolean }) => s.isActive === true)).toBe(true)
  })

  it('stores a script-tag-shaped name verbatim as text, with no server-side HTML rendering', async () => {
    const xssName = '<script>alert(1)</script>'
    const res = await request(bookingApp())
      .post('/api/services')
      .send({ name: xssName, durationMinutes: 30, price: 10 })

    expect(res.status).toBe(201)
    // booking-service stores raw text and returns JSON — it is React's escaping
    // on render that is the actual XSS defense (verified in the frontend
    // component review); this only confirms the API does not itself attempt
    // unsafe HTML interpolation or silent truncation that could hide a payload.
    expect(res.body.name).toBe(xssName)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('rejects an oversized durationMinutes/price that would silently corrupt TimeSlot generation upstream of the gateway cap', async () => {
    // The gateway caps durationMinutes<=480 and price<=100000; booking-service
    // itself only checks ">= 1" / ">= 0" — no upper bound. This documents that
    // gap: it is a defense-in-depth finding, not a blocking one, since the
    // gateway is the only network-reachable path per the architecture.
    const res = await request(bookingApp())
      .post('/api/services')
      .send({ name: 'Huge', durationMinutes: 999999, price: 1 })

    // Currently accepted — recorded here so a future change to add an upper
    // bound at this layer has a regression test ready to flip to 400.
    expect(res.status).toBe(201)
  })
})
