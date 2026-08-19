import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../app.ts'
import * as db from '../lib/db.ts'
import { HOLD_TTL_MS } from '../lib/config.ts'
import { Appointment } from '../models/appointment.model.ts'
import { Service } from '../models/service.model.ts'
import { TimeSlot } from '../models/time-slot.model.ts'

let mongo: MongoMemoryServer

beforeAll(async () => {
  // In-memory Mongo — never a real cluster (.rule/testing-rules.md).
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

beforeEach(async () => {
  await Promise.all([Service.deleteMany({}), TimeSlot.deleteMany({}), Appointment.deleteMany({})])
  // Every test in this file must be able to assert on the F4b call without a
  // real notification-service running, so the network is stubbed by default.
  // A test that cares about failure re-stubs it itself.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 202 }) as unknown as Response,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const app = () => createApp()

const DATE = '2026-08-18'

async function seedService(overrides: Record<string, unknown> = {}) {
  return Service.create({
    name: 'Full groom — small dog',
    durationMinutes: 90,
    price: 220,
    ...overrides,
  })
}

/** A slot in the state POST /api/appointments expects: freshly `held`. */
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

describe('POST /api/appointments — happy path', () => {
  it('returns 201 with exactly the contract fields and no others', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      serviceId: service.uuid,
      timeSlotId: slot.uuid,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
      status: 'pending',
    })
  })

  it('requires no authentication', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    // No Authorization header, no cookie — a Customer has no account (PRD F4).
    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
  })

  it('creates the Appointment as pending, never confirmed', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    await request(app()).post('/api/appointments').send(validBody(slot, service))

    const stored = await Appointment.findOne({ timeSlotId: slot._id })
    expect(stored?.status).toBe('pending')
  })

  it('flips the TimeSlot from held to booked', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('booked')
  })

  it('never leaks _id, __v, uuid or the audit fields', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    for (const leaked of ['_id', '__v', 'uuid', 'createdAt', 'deletedAt']) {
      expect(res.body).not.toHaveProperty(leaked)
    }
    // The ids are uuids, never internal ObjectIds.
    expect(mongoose.isValidObjectId(res.body.id)).toBe(false)
    expect(mongoose.isValidObjectId(res.body.serviceId)).toBe(false)
    expect(mongoose.isValidObjectId(res.body.timeSlotId)).toBe(false)
  })

  it('stores an attacker-controlled name verbatim rather than mangling it', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    const name = '<script>alert(1)</script>'

    const res = await request(app())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerName: name }))

    // Escaping belongs to whatever renders this, not to storage — a name is
    // not corrupted on the way in, and it never reaches a query as an operator.
    expect(res.status).toBe(201)
    expect(res.body.customerName).toBe(name)
    expect((await Appointment.findOne({ uuid: res.body.id }))?.customerName).toBe(name)
  })

  it('derives serviceId from the slot document, not from the request body', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    const stored = await Appointment.findOne({ uuid: res.body.id })
    expect(stored?.serviceId?.toString()).toBe(service._id.toString())
  })

  it('ignores a status supplied in the body — the endpoint decides the status', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app())
      .post('/api/appointments')
      .send({ ...validBody(slot, service), status: 'confirmed' })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect((await Appointment.findOne({ uuid: res.body.id }))?.status).toBe('pending')
  })

  it('trims surrounding whitespace from the contact fields', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app())
      .post('/api/appointments')
      .send(
        validBody(slot, service, {
          customerName: '  Dana Levi  ',
          customerPhone: '  050-123-4567 ',
          customerEmail: ' dana@example.com ',
        }),
      )

    expect(res.body.customerName).toBe('Dana Levi')
    expect(res.body.customerPhone).toBe('050-123-4567')
    expect(res.body.customerEmail).toBe('dana@example.com')
  })
})

describe('POST /api/appointments — optional email', () => {
  it('accepts an omitted email and returns the field absent, not empty', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    const body = validBody(slot, service)
    delete (body as { customerEmail?: string }).customerEmail

    const res = await request(app()).post('/api/appointments').send(body)

    expect(res.status).toBe(201)
    // Absence must be unambiguous — never an empty string (PRD F4).
    expect(res.body).not.toHaveProperty('customerEmail')
    expect((await Appointment.findOne({ uuid: res.body.id }))?.customerEmail).toBeUndefined()
  })

  it('treats an empty-string email as omitted rather than rejecting it', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app())
      .post('/api/appointments')
      .send(validBody(slot, service, { customerEmail: '' }))

    expect(res.status).toBe(201)
    expect(res.body).not.toHaveProperty('customerEmail')
  })

  it.each(['not-an-email', 'dana@', '@example.com', 'dana@example', 'da na@example.com'])(
    'returns 400 for the malformed email %j',
    async (customerEmail) => {
      const service = await seedService()
      const slot = await seedHeldSlot(service)

      const res = await request(app())
        .post('/api/appointments')
        .send(validBody(slot, service, { customerEmail }))

      expect(res.status).toBe(400)
      // No partial record, and the hold is untouched so the Customer can retry.
      expect(await Appointment.countDocuments({})).toBe(0)
      expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
    },
  )
})

describe('POST /api/appointments — validation', () => {
  it.each([
    ['customerName missing', { customerName: undefined }],
    ['customerName empty', { customerName: '' }],
    ['customerName blank', { customerName: '   ' }],
    ['customerName not a string', { customerName: 42 }],
    ['customerName too long', { customerName: 'a'.repeat(61) }],
    ['customerPhone missing', { customerPhone: undefined }],
    ['customerPhone empty', { customerPhone: '' }],
    ['customerPhone too short', { customerPhone: '0501234' }],
    ['customerPhone too long', { customerPhone: '0'.repeat(21) }],
    ['customerPhone not a string', { customerPhone: 5012345678 }],
    ['slotId missing', { slotId: undefined }],
    ['slotId malformed', { slotId: 'not-a-uuid' }],
    ['serviceId missing', { serviceId: undefined }],
    ['serviceId malformed', { serviceId: 'not-a-uuid' }],
  ])('returns 400 when %s, and stores nothing', async (_label, over) => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    const body: Record<string, unknown> = validBody(slot, service, over)
    for (const [k, v] of Object.entries(over)) if (v === undefined) delete body[k]

    const res = await request(app()).post('/api/appointments').send(body)

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTypeOf('string')
    expect(await Appointment.countDocuments({})).toBe(0)
    // A rejected body must never have consumed the hold.
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
  })

  it('returns 400 for a non-object body', async () => {
    const res = await request(app())
      .post('/api/appointments')
      .set('content-type', 'application/json')
      .send(JSON.stringify(['not', 'an', 'object']))

    expect(res.status).toBe(400)
  })

  it('rejects an injected operator object instead of merging it into the filter', async () => {
    const service = await seedService()
    await seedHeldSlot(service)

    // A crafted JSON body must never reach a database filter as an operator.
    const res = await request(app())
      .post('/api/appointments')
      .send({
        slotId: { $ne: null },
        serviceId: { $ne: null },
        customerName: 'Dana Levi',
        customerPhone: '050-123-4567',
      })

    expect(res.status).toBe(400)
    expect(await Appointment.countDocuments({})).toBe(0)
  })

  it('returns 400 when serviceId does not match the slot, without booking it', async () => {
    const service = await seedService()
    const other = await seedService({ name: 'Bath and blow dry' })
    const slot = await seedHeldSlot(service)

    // A client must not be able to book one Service's slot under another's
    // name — the slot document is authoritative, the body is a cross-check.
    const res = await request(app())
      .post('/api/appointments')
      .send(validBody(slot, service, { serviceId: other.uuid }))

    expect(res.status).toBe(400)
    expect(await Appointment.countDocuments({})).toBe(0)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
  })

  it('returns 404 for a well-formed slotId that matches no slot', async () => {
    const service = await seedService()

    const res = await request(app())
      .post('/api/appointments')
      .send(validBody({ uuid: crypto.randomUUID() }, service))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })
})

describe('POST /api/appointments — hold state (409)', () => {
  it('returns 409 for a slot that is still open and never held', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, { status: 'open', heldAt: null })

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'TimeSlot is no longer held' })
    expect(await Appointment.countDocuments({})).toBe(0)
    // The slot was not mutated — it is still available to everyone.
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('open')
  })

  it('returns 409 for an already booked slot without creating a second Appointment', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, { status: 'booked' })

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(409)
    expect(await Appointment.countDocuments({})).toBe(0)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('booked')
  })

  it('returns 409 when the hold has lapsed past the TTL', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, {
      heldAt: new Date(Date.now() - HOLD_TTL_MS - 1000),
    })

    // A lapsed hold counts as open (PRD F3b) — that slot belongs to everyone
    // again, so a Customer who lingered on the form must not be able to claim it.
    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(409)
    expect(await Appointment.countDocuments({})).toBe(0)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
  })

  it('still books a hold that is within the TTL but nearly expired', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, {
      heldAt: new Date(Date.now() - HOLD_TTL_MS + 5000),
    })

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
  })

  it('a second submit after a successful booking is a 409, not a second Appointment', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const first = await request(app()).post('/api/appointments').send(validBody(slot, service))
    const second = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(await Appointment.countDocuments({})).toBe(1)
  })
})

// The reason booking-service is in this plan's scope at all. A sequential pair
// of requests proves nothing about the race — these must be fired together.
describe('POST /api/appointments — concurrency', () => {
  it('a double-submit of the same held slot yields exactly one 201 and one 409', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const results = await Promise.all([
      request(app()).post('/api/appointments').send(validBody(slot, service)),
      request(app()).post('/api/appointments').send(validBody(slot, service)),
    ])

    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(1)

    // The invariant that actually matters: one slot, one Appointment, ever.
    expect(await Appointment.countDocuments({})).toBe(1)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('booked')
  })

  it('allows exactly one winner across many simultaneous submits', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app()).post('/api/appointments').send(validBody(slot, service)),
      ),
    )

    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(11)
    expect(await Appointment.countDocuments({})).toBe(1)
  })

  it('lets concurrent bookings of different slots all succeed', async () => {
    const service = await seedService()
    const a = await seedHeldSlot(service, { startTime: '09:00' })
    const b = await seedHeldSlot(service, { startTime: '11:00' })

    const results = await Promise.all([
      request(app()).post('/api/appointments').send(validBody(a, service)),
      request(app()).post('/api/appointments').send(validBody(b, service)),
    ])

    // Exclusivity is per-slot — it must not serialize unrelated customers.
    expect(results.map((r) => r.status)).toEqual([201, 201])
    expect(await Appointment.countDocuments({})).toBe(2)
  })
})

describe('POST /api/appointments — confirmation notification (F4b)', () => {
  it('fires a best-effort call to notification-service after a successful booking', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    expect(res.status).toBe(201)
    // The call is deliberately un-awaited, so let the microtask queue drain.
    await new Promise((r) => setImmediate(r))

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (globalThis.fetch as unknown as { mock: { calls: any[][] } }).mock.calls[0]
    expect(String(url)).toContain('/api/notifications/appointment-confirmation')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      appointmentId: res.body.id,
      serviceName: 'Full groom — small dog',
      date: DATE,
      startTime: '09:00',
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
    })
  })

  it('does not notify when the booking was rejected', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service, { status: 'booked' })

    await request(app()).post('/api/appointments').send(validBody(slot, service))
    await new Promise((r) => setImmediate(r))

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('still returns 201 when notification-service is down', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))
    await new Promise((r) => setImmediate(r))

    // An outage in notification-service must never cost a Customer a booking,
    // and must never roll one back the datastore has already accepted.
    expect(res.status).toBe(201)
    expect(await Appointment.countDocuments({})).toBe(1)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('booked')
    expect(logged).toHaveBeenCalled()
  })

  it('still returns 201 when notification-service returns an error status', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500 }) as unknown as Response,
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))
    await new Promise((r) => setImmediate(r))

    expect(res.status).toBe(201)
    expect(await Appointment.countDocuments({})).toBe(1)
  })
})

describe('POST /api/appointments — failure envelopes', () => {
  it('returns 503 with a clean envelope when the database is unreachable', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app())
      .post('/api/appointments')
      .send(validBody({ uuid: crypto.randomUUID() }, { uuid: crypto.randomUUID() }))

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the update fails unexpectedly', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    vi.spyOn(TimeSlot, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('boom: raw mongoose failure with internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).post('/api/appointments').send(validBody(slot, service))

    // The raw driver message must never reach the client.
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('Appointment model', () => {
  it('requires serviceId, timeSlotId, customerName and customerPhone', async () => {
    await expect(Appointment.create({ customerName: 'Dana Levi' })).rejects.toThrow()
  })

  it('defaults status to pending and generates a uuid', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    const appointment = await Appointment.create({
      serviceId: service._id,
      timeSlotId: slot._id,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
    })

    expect(appointment.status).toBe('pending')
    expect(appointment.deletedAt).toBeNull()
    expect(appointment.uuid).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('rejects a status outside the pending/confirmed/cancelled enum', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)

    await expect(
      Appointment.create({
        serviceId: service._id,
        timeSlotId: slot._id,
        customerName: 'Dana Levi',
        customerPhone: '050-123-4567',
        status: 'booked',
      }),
    ).rejects.toThrow()
  })

  it('excludes soft-deleted records from queries', async () => {
    const service = await seedService()
    const slot = await seedHeldSlot(service)
    await Appointment.create({
      serviceId: service._id,
      timeSlotId: slot._id,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      deletedAt: new Date(),
    })

    expect(await Appointment.find({})).toHaveLength(0)
  })
})
