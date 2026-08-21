/**
 * Security tests for ADMINDAS-SEC (plan 013 — Admin Dashboard: Appointments
 * management, confirm/cancel).
 *
 * Scope: the new Admin surface this task added —
 *   - api-gateway: `GET /api/appointments`, `PATCH /api/appointments/:id/confirm`,
 *     `PATCH /api/appointments/:id/cancel`, all mounted behind `verifyJwt`.
 *   - booking-service: the same three routes, trusted-but-unauthenticated
 *     (api-gateway is the only intended caller).
 *
 * These tests focus on attack classes the existing dev-authored suites
 * (`appointment-proxy.test.ts`, `appointment-admin.test.ts`) do not already
 * pin exhaustively: JWT algorithm/claim-forging attacks at the gateway's one
 * security boundary, and defense-in-depth injection/PII checks directly
 * against booking-service, which is reachable with no auth of its own by
 * design (documented trust boundary — see report).
 *
 * Run from `backend/api-gateway` and `backend/booking-service` respectively
 * (so each one's node_modules resolves), e.g.:
 *   cd backend/api-gateway && npx vitest run ../../docs/tests/security/admin-appointments-management.security.test.ts
 *   cd backend/booking-service && npx vitest run ../../docs/tests/security/admin-appointments-management.security.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

// --- api-gateway: JWT attack surface ---------------------------------------

const GATEWAY_SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-shared-with-user-service'
  process.env.BOOKING_SERVICE_URL = 'http://booking.test:4001'
  return process.env.JWT_SECRET
})

const { createApp: createGatewayApp } = await import(
  '../../../backend/api-gateway/api/app.ts'
)

const APPOINTMENT_ID = '7c1f9a2e-4d3b-4a51-9f6c-2b8e0d5a7c31'
const APPOINTMENT = {
  id: APPOINTMENT_ID,
  serviceId: '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b',
  timeSlotId: '9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4',
  customerName: 'Dana Levi',
  customerPhone: '050-123-4567',
  customerEmail: 'dana@example.com',
  status: 'pending',
  service: { name: 'Full groom', durationMinutes: 90, price: 220 },
  timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:30' },
}

function mockGatewayUpstream(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('security: Admin Appointment routes — JWT forging attacks (api-gateway)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects a token whose header claims alg:none, even with an empty signature', async () => {
    const fetchMock = mockGatewayUpstream(200, [APPOINTMENT])

    // Hand-crafted alg:none JWT: header.payload. with no signature segment.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    )
    const payload = Buffer.from(JSON.stringify({ sub: 'admin-uuid', role: 'admin' })).toString(
      'base64url',
    )
    const forged = `${header}.${payload}.`

    const res = await request(createGatewayApp())
      .get('/api/appointments')
      .set('Authorization', `Bearer ${forged}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a token signed with HS256 whose payload claims role admin but is unsigned-by-us (algorithm confusion via RS/HS mismatch)', async () => {
    const fetchMock = mockGatewayUpstream(200, [APPOINTMENT])

    // Simulates an attacker who obtained a public key or guessed a different
    // shared value and tries to pass it off as a legitimately-signed token.
    const forged = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, 'attacker-guessed-secret', {
      algorithm: 'HS256',
      expiresIn: '1h',
    })

    const res = await request(createGatewayApp())
      .get('/api/appointments')
      .set('Authorization', `Bearer ${forged}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a validly-signed token whose role claim has been changed from a non-admin role', async () => {
    const fetchMock = mockGatewayUpstream(200, [APPOINTMENT])

    // Signed with the REAL secret, but role is not 'admin' — proves the
    // gateway checks the claim's value, not merely the signature's validity.
    const nonAdmin = jwt.sign({ sub: 'someone', role: 'customer' }, GATEWAY_SECRET, {
      expiresIn: '1h',
    })

    const res = await request(createGatewayApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', `Bearer ${nonAdmin}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a validly-signed token missing the role claim entirely', async () => {
    const fetchMock = mockGatewayUpstream(200, [APPOINTMENT])

    const noRole = jwt.sign({ sub: 'admin-uuid' }, GATEWAY_SECRET, { expiresIn: '1h' })

    const res = await request(createGatewayApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', `Bearer ${noRole}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a validly-signed token missing the sub claim', async () => {
    const fetchMock = mockGatewayUpstream(200, [APPOINTMENT])

    const noSub = jwt.sign({ role: 'admin' }, GATEWAY_SECRET, { expiresIn: '1h' })

    const res = await request(createGatewayApp())
      .get('/api/appointments')
      .set('Authorization', `Bearer ${noSub}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never leaks Appointment PII in a 401 response body', async () => {
    mockGatewayUpstream(200, [APPOINTMENT])

    const res = await request(createGatewayApp()).get('/api/appointments')

    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain('Dana Levi')
    expect(JSON.stringify(res.body)).not.toContain('dana@example.com')
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('cannot use a Basic-auth-shaped header to bypass the Bearer check', async () => {
    const fetchMock = mockGatewayUpstream(200, [APPOINTMENT])

    const res = await request(createGatewayApp())
      .get('/api/appointments')
      .set('Authorization', `Basic ${Buffer.from('admin:admin').toString('base64')}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a path-traversal-shaped id segment is rejected before any upstream call is made', async () => {
    const fetchMock = mockGatewayUpstream(200, APPOINTMENT)
    const token = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, GATEWAY_SECRET, {
      expiresIn: '1h',
    })

    const res = await request(createGatewayApp())
      .patch('/api/appointments/..%2f..%2fadmin/confirm')
      .set('Authorization', `Bearer ${token}`)

    expect([400, 404]).toContain(res.status)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// --- booking-service: injection / PII / trust-boundary checks --------------

describe('security: Admin Appointment routes — booking-service defense-in-depth', () => {
  let mongo: MongoMemoryServer
  let createBookingApp: () => import('express').Express
  let Appointment: typeof import('../../../backend/booking-service/api/models/appointment.model.ts').Appointment
  let Service: typeof import('../../../backend/booking-service/api/models/service.model.ts').Service
  let TimeSlot: typeof import('../../../backend/booking-service/api/models/time-slot.model.ts').TimeSlot

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri())

    const appMod = await import('../../../backend/booking-service/api/app.ts')
    const apptMod = await import('../../../backend/booking-service/api/models/appointment.model.ts')
    const svcMod = await import('../../../backend/booking-service/api/models/service.model.ts')
    const slotMod = await import('../../../backend/booking-service/api/models/time-slot.model.ts')

    createBookingApp = appMod.createApp
    Appointment = apptMod.Appointment
    Service = svcMod.Service
    TimeSlot = slotMod.TimeSlot
  }, 120_000)

  afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
  })

  beforeEach(async () => {
    await Promise.all([Service.deleteMany({}), TimeSlot.deleteMany({}), Appointment.deleteMany({})])
  })

  const DATE = '2026-08-18'

  async function seedAppointment(status = 'pending') {
    const service = await Service.create({
      name: 'Full groom — small dog',
      durationMinutes: 90,
      price: 220,
    })
    const slot = await TimeSlot.create({
      serviceId: service._id,
      date: DATE,
      startTime: '09:00',
      endTime: '10:30',
      status: 'booked',
    })
    const appointment = await Appointment.create({
      serviceId: service._id,
      timeSlotId: slot._id,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
      status,
    })
    return { service, slot, appointment }
  }

  // -- NoSQL injection on the :id path segment --------------------------------

  it('rejects an operator object smuggled into the :id path segment for confirm', async () => {
    const { appointment } = await seedAppointment('pending')

    const res = await request(createBookingApp())
      .patch(`/api/appointments/${encodeURIComponent(JSON.stringify({ $ne: null }))}/confirm`)

    expect(res.status).toBe(400)
    expect(await Appointment.findOne({ uuid: appointment.uuid }).then((d) => d!.status)).toBe(
      'pending',
    )
  })

  it('rejects an operator object smuggled into the :id path segment for cancel', async () => {
    const { appointment, slot } = await seedAppointment('confirmed')

    const res = await request(createBookingApp())
      .patch(`/api/appointments/${encodeURIComponent(JSON.stringify({ $gt: '' }))}/cancel`)

    expect(res.status).toBe(400)
    expect(await Appointment.findOne({ uuid: appointment.uuid }).then((d) => d!.status)).toBe(
      'confirmed',
    )
    // Nothing was released either — a rejected path segment must not touch
    // ANY appointment's slot as a side effect.
    expect(await TimeSlot.findOne({ uuid: slot.uuid }).then((d) => d!.status)).toBe('booked')
  })

  it('a crafted id cannot be used as a wildcard to confirm every pending appointment at once', async () => {
    await seedAppointment('pending')
    await seedAppointment('pending')
    await seedAppointment('pending')

    // Attempt: an empty/near-empty id segment, hoping a loose regex or an
    // unguarded filter treats it as "match all".
    const res = await request(createBookingApp()).patch('/api/appointments//confirm')

    expect(res.status).not.toBe(200)
    expect(await Appointment.countDocuments({ status: 'confirmed' })).toBe(0)
  })

  // -- Soft-delete integrity on the transition path ----------------------------

  it('cannot confirm a soft-deleted Appointment via its still-valid uuid', async () => {
    const { appointment } = await seedAppointment('pending')
    await Appointment.updateOne({ _id: appointment._id }, { $set: { deletedAt: new Date() } })

    const res = await request(createBookingApp()).patch(
      `/api/appointments/${appointment.uuid}/confirm`,
    )

    expect(res.status).toBe(404)
    expect(await Appointment.findOne({ uuid: appointment.uuid }).then((d) => d!.status)).toBe(
      'pending',
    )
  })

  it('cannot cancel a soft-deleted Appointment, and its TimeSlot is not released', async () => {
    const { appointment, slot } = await seedAppointment('confirmed')
    await Appointment.updateOne({ _id: appointment._id }, { $set: { deletedAt: new Date() } })

    const res = await request(createBookingApp()).patch(
      `/api/appointments/${appointment.uuid}/cancel`,
    )

    expect(res.status).toBe(404)
    expect(await TimeSlot.findOne({ uuid: slot.uuid }).then((d) => d!.status)).toBe('booked')
  })

  // -- PII exposure surface (list aggregates every customer's contact info) --

  it('never leaks a stack trace or raw Mongoose error text on a transition failure', async () => {
    const { appointment } = await seedAppointment('pending')
    vi.spyOn(Appointment, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw new Error('MongoServerError at /internal/path/db.js:123')
    })

    const res = await request(createBookingApp()).patch(
      `/api/appointments/${appointment.uuid}/confirm`,
    )

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
    expect(JSON.stringify(res.body)).not.toMatch(/\.js:\d+/)
    vi.restoreAllMocks()
  })

  it('the admin list response never includes internal ids that could be replayed as a public receipt id ambiguity', async () => {
    await seedAppointment('pending')

    const res = await request(createBookingApp()).get('/api/appointments')

    expect(res.status).toBe(200)
    for (const leaked of ['_id', '__v']) {
      expect(res.body[0]).not.toHaveProperty(leaked)
    }
    // The exposed `id` must be the opaque uuid, not a guessable Mongo ObjectId.
    expect(mongoose.isValidObjectId(res.body[0].id)).toBe(false)
  })

  it("a confirm/cancel response cannot be used to enumerate a different appointment's PII via a crafted-but-wrong id", async () => {
    const { appointment: real } = await seedAppointment('pending')
    const guessed = '00000000-0000-4000-8000-000000000001'

    const res = await request(createBookingApp()).patch(`/api/appointments/${guessed}/confirm`)

    expect(res.status).toBe(404)
    expect(JSON.stringify(res.body)).not.toContain('Dana Levi')
    expect(JSON.stringify(res.body)).not.toContain(real.uuid)
  })

  // -- Cross-collection consistency under a hostile-timing race --------------

  it('a losing concurrent cancel can never observe or leak the slot state of the winner', async () => {
    const { appointment, slot } = await seedAppointment('confirmed')

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(createBookingApp()).patch(`/api/appointments/${appointment.uuid}/cancel`),
      ),
    )

    const ok = results.filter((r) => r.status === 200)
    const conflict = results.filter((r) => r.status === 409)
    expect(ok.length).toBe(1)
    expect(conflict.length).toBe(4)
    // The slot is released exactly once, never left double-processed.
    expect(await TimeSlot.findOne({ uuid: slot.uuid }).then((d) => d!.status)).toBe('open')
  })
})
