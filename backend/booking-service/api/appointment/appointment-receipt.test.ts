import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../app.ts'
import * as db from '../lib/db.ts'
import { Appointment } from '../models/appointment.model.ts'
import { Service } from '../models/service.model.ts'
import { TimeSlot } from '../models/time-slot.model.ts'

// GET /api/appointments/:id — the Customer's receipt (PRD Screen 4, BOOKINGC-APT).
//
// Kept in its own file rather than appended to appointment.test.ts because the
// concerns are different: that file exercises a public *mutation* with a
// concurrency contract, this one exercises a public *read* whose contract is
// about exposing exactly the documented fields and nothing more.

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
})

afterEach(() => {
  vi.restoreAllMocks()
})

const app = () => createApp()

const DATE = '2026-08-18'
// A syntactically valid uuid that is never seeded, for the "no such record" case.
const ABSENT_ID = '7b2e4d6f-8a91-4c3b-9d5e-1f2a3b4c5d6e'

async function seedService(overrides: Record<string, unknown> = {}) {
  return Service.create({
    name: 'Full groom — small dog',
    durationMinutes: 90,
    price: 220,
    ...overrides,
  })
}

/** A slot already finalized to `booked` — the state a receipt reads back. */
async function seedBookedSlot(
  service: { _id: mongoose.Types.ObjectId },
  overrides: Record<string, unknown> = {},
) {
  return TimeSlot.create({
    serviceId: service._id,
    date: DATE,
    startTime: '09:00',
    endTime: '10:30',
    status: 'booked',
    heldAt: new Date(),
    ...overrides,
  })
}

async function seedAppointment(
  service: { _id: mongoose.Types.ObjectId },
  slot: { _id: mongoose.Types.ObjectId },
  overrides: Record<string, unknown> = {},
) {
  return Appointment.create({
    serviceId: service._id,
    timeSlotId: slot._id,
    customerName: 'Dana Levi',
    customerPhone: '050-123-4567',
    customerEmail: 'dana@example.com',
    ...overrides,
  })
}

describe('GET /api/appointments/:id — happy path', () => {
  it('returns the Appointment enriched with the Service and TimeSlot facts', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot)

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: appointment.uuid,
      serviceId: service.uuid,
      timeSlotId: slot.uuid,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
      status: 'pending',
      service: { name: 'Full groom — small dog', durationMinutes: 90, price: 220 },
      timeSlot: { date: DATE, startTime: '09:00', endTime: '10:30' },
    })
  })

  it('returns ONLY the AppointmentReceipt fields — no internal or audit data', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot)

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    // additionalProperties: false, enforced literally. This response goes to an
    // unauthenticated caller, so a leak by omission is the risk being guarded.
    expect(Object.keys(res.body).sort()).toEqual([
      'customerEmail',
      'customerName',
      'customerPhone',
      'id',
      'service',
      'serviceId',
      'status',
      'timeSlot',
      'timeSlotId',
    ])
    expect(Object.keys(res.body.service).sort()).toEqual(['durationMinutes', 'name', 'price'])
    expect(Object.keys(res.body.timeSlot).sort()).toEqual(['date', 'endTime', 'startTime'])
    // Never the Mongo internals, never the server-side hold bookkeeping.
    expect(res.text).not.toContain('_id')
    expect(res.text).not.toContain('__v')
    expect(res.text).not.toContain('heldAt')
    expect(res.text).not.toContain('deletedAt')
    expect(res.text).not.toContain('isActive')
  })

  it('omits customerEmail entirely when the Customer left it blank', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot, { customerEmail: undefined })

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    expect(res.status).toBe(200)
    // Absent, not an empty string, so absence is unambiguous to the client.
    expect(res.body).not.toHaveProperty('customerEmail')
  })

  it('still reads back after the Service is deactivated', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot)
    // A receipt records what was booked: whether the clinic still offers the
    // treatment says nothing about an appointment already made.
    await Service.updateOne({ _id: service._id }, { $set: { isActive: false } })

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    expect(res.status).toBe(200)
    expect(res.body.service.name).toBe('Full groom — small dog')
  })

  it('is read-only: it mutates neither the Appointment nor the TimeSlot', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot)

    await request(app()).get(`/api/appointments/${appointment.uuid}`)

    const slotAfter = await TimeSlot.findById(slot._id).lean()
    const appointmentAfter = await Appointment.findById(appointment._id).lean()
    expect(slotAfter?.status).toBe('booked')
    expect(slotAfter?.heldAt?.getTime()).toBe(slot.heldAt?.getTime())
    expect(appointmentAfter?.status).toBe('pending')
    expect(appointmentAfter?.deletedAt).toBeNull()
  })
})

describe('GET /api/appointments/:id — not found and malformed ids', () => {
  it('returns 404 for a well-formed uuid that matches no Appointment', async () => {
    const res = await request(app()).get(`/api/appointments/${ABSENT_ID}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('returns 400 for a malformed id, with the SAME body as a 404', async () => {
    const missing = await request(app()).get(`/api/appointments/${ABSENT_ID}`)
    const malformed = await request(app()).get('/api/appointments/not-a-uuid')

    expect(malformed.status).toBe(400)
    // Identical bodies: the response must not let an enumerating caller
    // distinguish "exists" from "does not".
    expect(malformed.body).toEqual(missing.body)
  })

  it('rejects an operator-shaped id before it can reach a query filter', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    await seedAppointment(service, slot)

    // Percent-encoded {"$ne":null} — must be rejected as a malformed id, never
    // parsed into a filter that would match the first Appointment in the
    // collection and hand a stranger someone else's contact details.
    const res = await request(app()).get('/api/appointments/%7B%22%24ne%22%3Anull%7D')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('returns 404 for a soft-deleted Appointment', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot, { deletedAt: new Date() })

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })
})

describe('GET /api/appointments/:id — failure modes', () => {
  it('returns 503 when the database is not connected', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).get(`/api/appointments/${ABSENT_ID}`)

    // Transient and retryable, so the frontend can distinguish "come back
    // later" from a real bug rather than showing the not-found receipt copy.
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 without leaking a driver message when the query throws', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    const appointment = await seedAppointment(service, slot)

    vi.spyOn(Appointment, 'findOne').mockImplementation(() => {
      throw new Error('connection reset by peer')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})
