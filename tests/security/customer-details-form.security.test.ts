/**
 * Security tests for CUSTOMER-SEC (plan 009 — Customer Details Form).
 *
 * Scope: the two public, unauthenticated mutation endpoints this task added —
 * `POST /api/appointments` (booking-service) and
 * `POST /api/notifications/appointment-confirmation` (notification-service) —
 * plus the frontend surface that calls them.
 *
 * These import the real `createApp()` builders via relative paths, exactly as
 * each service's own test suite does, so the standard Node/NoSQL-injection,
 * PII-leak and race-condition checks run against the actual route stack.
 *
 * Run from `backend/booking-service` (so its `node_modules` resolves), e.g.:
 *   cd backend/booking-service && npx vitest run ../../tests/security/customer-details-form.security.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp as createBookingApp } from '../../backend/booking-service/api/app.ts'
import { Appointment } from '../../backend/booking-service/api/models/appointment.model.ts'
import { Service } from '../../backend/booking-service/api/models/service.model.ts'
import { TimeSlot } from '../../backend/booking-service/api/models/time-slot.model.ts'

import { createApp as createNotificationApp } from '../../backend/notification-service/api/app.ts'
import { resetSentNotifications } from '../../backend/notification-service/api/notification/notification.service.ts'

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
  await Promise.all([Service.deleteMany({}), TimeSlot.deleteMany({}), Appointment.deleteMany({})])
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 202 }) as unknown as Response,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const bookingApp = () => createBookingApp()
const notificationApp = () => createNotificationApp()

const DATE = '2026-08-18'

async function seedService(overrides: Record<string, unknown> = {}) {
  return Service.create({
    name: 'Full groom — small dog',
    durationMinutes: 90,
    price: 220,
    ...overrides,
  })
}

async function seedHeldSlot(
  service: { _id: mongoose.Types.ObjectId },
  overrides: Record<string, unknown> = {},
) {
  return TimeSlot.create({
    serviceId: service._id,
    date: DATE,
    startTime: '09:00',
    endTime: '10:30',
    status: 'held',
    heldAt: new Date(),
    ...overrides,
  })
}

function validBody(slot: { uuid: string }, service: { uuid: string }, over = {}) {
  return {
    slotId: slot.uuid,
    serviceId: service.uuid,
    customerName: 'Dana Levi',
    customerPhone: '050-123-4567',
    customerEmail: 'dana@example.com',
    ...over,
  }
}

// ---------------------------------------------------------------------------
// POST /api/appointments — NoSQL / type-confusion injection
// ---------------------------------------------------------------------------
describe('security: POST /api/appointments — NoSQL injection & type confusion', () => {
  it('rejects an object operator in slotId instead of letting it reach a Mongo filter', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { slotId: { $ne: null } }))

    expect(res.status).toBe(400)
    // Must not have matched anything or mutated the real slot.
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
  })

  it('rejects an object operator in serviceId', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { serviceId: { $gt: '' } }))

    expect(res.status).toBe(400)
  })

  it('rejects an array in place of a scalar field', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerName: ['a', 'b'] }))

    expect(res.status).toBe(400)
  })

  it('rejects a non-object JSON body (array) outright', async () => {
    const res = await request(bookingApp())
      .post('/api/appointments')
      .send([{ foo: 'bar' }])

    expect(res.status).toBe(400)
  })

  it('does not create a partial Appointment when validation fails midway', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerPhone: '' }))

    expect(await Appointment.countDocuments({})).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// POST /api/appointments — stored XSS / free-text handling
// ---------------------------------------------------------------------------
describe('security: POST /api/appointments — stored payloads in customerName', () => {
  it('accepts a script-tag-bearing name, stores it verbatim (no silent mutation), and never executes it server-side', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    const payload = '<script>alert(1)</script>'

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerName: payload }))

    expect(res.status).toBe(201)
    // Verbatim storage is intentional (escaping is a rendering-layer job) —
    // this test documents that expectation and pins it; the report flags that
    // any *rendering* surface for customerName (a future Admin appointments
    // list, a notification template) MUST escape on output.
    expect(res.body.customerName).toBe(payload)
    const stored = await Appointment.findOne({ timeSlotId: slot._id })
    expect(stored?.customerName).toBe(payload)
  })

  it('rejects a customerName over the 60-char contract limit rather than truncating it', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerName: 'x'.repeat(61) }))

    expect(res.status).toBe(400)
    expect(await Appointment.countDocuments({})).toBe(0)
  })

  it('rejects an oversized customerPhone (guards against payload-size abuse of a "free-ish" field)', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerPhone: '1'.repeat(21) }))

    expect(res.status).toBe(400)
  })

  it('rejects a malformed customerEmail rather than storing junk contact data', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerEmail: 'not-an-email' }))

    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST /api/appointments — authorization / IDOR-style checks
// ---------------------------------------------------------------------------
describe('security: POST /api/appointments — authorization & cross-tenant checks', () => {
  it('requires no authentication (by design), and this is verified rather than assumed', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
  })

  it("rejects a slotId/serviceId pair that does not match (cannot book Service A into Service B's slot)", async () => {
    const serviceA = await seedService({ name: 'A' })
    const serviceB = await seedService({ name: 'B' })
    const slot = await seedHeldSlot(serviceA)

    const res = await request(bookingApp())
      .post('/api/appointments')
      .send(validBody(slot, serviceB))

    expect(res.status).toBe(400)
    expect(await Appointment.countDocuments({})).toBe(0)
  })

  it('returns 409, not 201, for a slot that is already booked (cannot double-book by resubmitting)', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, { status: 'booked' })

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(409)
  })

  it('returns 409 for a hold that has lapsed past the TTL, not a 201 (server-side expiry is authoritative)', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, { heldAt: new Date(Date.now() - 10 * 60 * 1000) })

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(409)
    expect(await Appointment.countDocuments({})).toBe(0)
  })

  it('never leaks internal Mongo _id / __v / uuid / audit fields in the response', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    for (const leaked of ['_id', '__v', 'uuid', 'createdAt', 'deletedAt']) {
      expect(res.body).not.toHaveProperty(leaked)
    }
    expect(mongoose.isValidObjectId(res.body.id)).toBe(false)
  })

  it('never leaks a stack trace or raw Mongoose error text on a 500', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    vi.spyOn(Appointment, 'create').mockRejectedValueOnce(
      new Error('E11000 duplicate key at /some/internal/path.js:42'),
    )

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
    expect(JSON.stringify(res.body)).not.toMatch(/\.js:\d+/)
  })
})

// ---------------------------------------------------------------------------
// POST /api/appointments — race condition / concurrency
// ---------------------------------------------------------------------------
describe('security: POST /api/appointments — concurrent double-submit cannot double-book', () => {
  it('resolves N simultaneous submits for one held slot to exactly one 201 and the rest 409', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const attempts = 10
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        request(bookingApp()).post('/api/appointments').send(validBody(slot, service)),
      ),
    )

    const created = results.filter((r) => r.status === 201)
    const conflicted = results.filter((r) => r.status === 409)

    expect(created.length).toBe(1)
    expect(conflicted.length).toBe(attempts - 1)
    expect(await Appointment.countDocuments({})).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// POST /api/appointments — resilience to a hostile/failing notification-service
// ---------------------------------------------------------------------------
describe('security: POST /api/appointments — notification-service outage cannot be leveraged', () => {
  it('still returns 201 and commits the booking when the notification call fails outright', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
  })

  it('still returns 201 when the notification call hangs (never awaited on the response path)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    )
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(bookingApp()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// POST /api/notifications/appointment-confirmation — the server-to-server
// endpoint. It has no authentication/shared-secret of its own (see report),
// so these tests both pin its input-validation posture and demonstrate that
// posture is the only thing standing between it and anonymous callers.
// ---------------------------------------------------------------------------
describe('security: POST /api/notifications/appointment-confirmation', () => {
  beforeEach(() => {
    resetSentNotifications()
  })

  function validNotificationBody(over: Record<string, unknown> = {}) {
    return {
      appointmentId: '3c9d1e2f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
      serviceName: 'Full groom',
      date: DATE,
      startTime: '09:00',
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
      ...over,
    }
  }

  it('rejects a NoSQL-operator-shaped customerName rather than passing it through', async () => {
    const res = await request(notificationApp())
      .post('/api/notifications/appointment-confirmation')
      .send(validNotificationBody({ customerName: { $ne: null } }))

    expect(res.status).toBe(400)
  })

  it('rejects an array/object body outright', async () => {
    const res = await request(notificationApp())
      .post('/api/notifications/appointment-confirmation')
      .send([validNotificationBody()])

    expect(res.status).toBe(400)
  })

  it('rejects a non-uuid appointmentId', async () => {
    const res = await request(notificationApp())
      .post('/api/notifications/appointment-confirmation')
      .send(validNotificationBody({ appointmentId: 'not-a-uuid' }))

    expect(res.status).toBe(400)
  })

  it('is reachable with no authentication of any kind — documents the missing server-to-server auth', async () => {
    // This is the finding, demonstrated: any network-reachable caller — not
    // only booking-service — can trigger a "sent" notification record with a
    // well-formed body. See report Risk #1.
    const res = await request(notificationApp())
      .post('/api/notifications/appointment-confirmation')
      .send(validNotificationBody())

    expect(res.status).toBe(202)
  })

  it('never reflects customerPhone/customerEmail (PII) back in the response body', async () => {
    const res = await request(notificationApp())
      .post('/api/notifications/appointment-confirmation')
      .send(validNotificationBody())

    expect(res.body).not.toHaveProperty('customerPhone')
    expect(res.body).not.toHaveProperty('customerEmail')
    expect(JSON.stringify(res.body)).not.toContain('dana@example.com')
    expect(JSON.stringify(res.body)).not.toContain('050-123-4567')
  })

  it('drops any unexpected/extra field rather than reflecting it (mass-assignment guard)', async () => {
    const res = await request(notificationApp())
      .post('/api/notifications/appointment-confirmation')
      .send(validNotificationBody({ isAdmin: true }))

    expect(res.status).toBe(202)
    expect(res.body).not.toHaveProperty('isAdmin')
  })
})
