import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../app.ts'
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
})

const app = () => createApp()

const DATE = '2026-08-18'
const OTHER_DATE = '2026-08-19'
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

async function seedService(overrides: Record<string, unknown> = {}) {
  return Service.create({
    name: 'Full groom — small dog',
    durationMinutes: 90,
    price: 220,
    ...overrides,
  })
}

/** A slot in the state a real Appointment implies: already `booked`. */
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
    ...overrides,
  })
}

/**
 * A full Appointment + its booked slot, which is how every one of these records
 * actually comes into existence via POST /api/appointments.
 */
async function seedAppointment(
  overrides: { status?: string; date?: string; startTime?: string } = {},
) {
  const service = await seedService()
  const slot = await seedBookedSlot(service, {
    ...(overrides.date ? { date: overrides.date } : {}),
    ...(overrides.startTime ? { startTime: overrides.startTime } : {}),
  })
  const appointment = await Appointment.create({
    serviceId: service._id,
    timeSlotId: slot._id,
    customerName: 'Dana Levi',
    customerPhone: '050-123-4567',
    customerEmail: 'dana@example.com',
    status: overrides.status ?? 'pending',
  })

  return { service, slot, appointment }
}

describe('GET /api/appointments — Admin list (F9)', () => {
  it('returns every appointment with the Service and TimeSlot display fields', async () => {
    const { service, slot, appointment } = await seedAppointment()

    const res = await request(app()).get('/api/appointments')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      {
        id: appointment.uuid,
        serviceId: service.uuid,
        timeSlotId: slot.uuid,
        customerName: 'Dana Levi',
        customerPhone: '050-123-4567',
        customerEmail: 'dana@example.com',
        status: 'pending',
        service: { name: 'Full groom — small dog', durationMinutes: 90, price: 220 },
        timeSlot: { date: DATE, startTime: '09:00', endTime: '10:30' },
      },
    ])
  })

  it('returns an empty array when nothing is booked — not an error', async () => {
    const res = await request(app()).get('/api/appointments')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('includes cancelled appointments — the Admin list is an audit record', async () => {
    await seedAppointment({ status: 'cancelled' })

    const res = await request(app()).get('/api/appointments')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].status).toBe('cancelled')
  })

  it('never serializes internal fields, even though the record holds PII', async () => {
    await seedAppointment()

    const res = await request(app()).get('/api/appointments')

    const row = res.body[0]
    for (const leaked of ['_id', '__v', 'uuid', 'createdAt', 'deletedAt']) {
      expect(row).not.toHaveProperty(leaked)
    }
    // Nor on the nested snapshots: no isActive, no slot status/hold bookkeeping.
    expect(Object.keys(row.service).sort()).toEqual(['durationMinutes', 'name', 'price'])
    expect(Object.keys(row.timeSlot).sort()).toEqual(['date', 'endTime', 'startTime'])
  })

  it('omits customerEmail entirely when the Customer left it blank', async () => {
    const service = await seedService()
    const slot = await seedBookedSlot(service)
    await Appointment.create({
      serviceId: service._id,
      timeSlotId: slot._id,
      customerName: 'Noa',
      customerPhone: '050-999-8888',
    })

    const res = await request(app()).get('/api/appointments')

    expect(res.body[0]).not.toHaveProperty('customerEmail')
  })

  it('excludes soft-deleted appointments', async () => {
    const { appointment } = await seedAppointment()
    await Appointment.updateOne({ _id: appointment._id }, { $set: { deletedAt: new Date() } })

    const res = await request(app()).get('/api/appointments')

    expect(res.body).toEqual([])
  })

  it('narrows the list by ?status=', async () => {
    await seedAppointment({ status: 'pending', startTime: '09:00' })
    await seedAppointment({ status: 'confirmed', startTime: '11:00' })
    await seedAppointment({ status: 'cancelled', startTime: '13:00' })

    const res = await request(app()).get('/api/appointments?status=confirmed')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].status).toBe('confirmed')
  })

  it('narrows the list by ?date=', async () => {
    await seedAppointment({ date: DATE })
    await seedAppointment({ date: OTHER_DATE })

    const res = await request(app()).get(`/api/appointments?date=${DATE}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].timeSlot.date).toBe(DATE)
  })

  it('combines ?date= and ?status=', async () => {
    await seedAppointment({ date: DATE, status: 'pending' })
    await seedAppointment({ date: DATE, status: 'confirmed', startTime: '11:00' })
    await seedAppointment({ date: OTHER_DATE, status: 'confirmed' })

    const res = await request(app()).get(`/api/appointments?date=${DATE}&status=confirmed`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].timeSlot.date).toBe(DATE)
    expect(res.body[0].status).toBe('confirmed')
  })

  it('returns an empty list for a day with no slots at all', async () => {
    await seedAppointment({ date: DATE })

    const res = await request(app()).get('/api/appointments?date=2030-01-01')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rejects an unknown ?status= with 400 rather than silently showing everything', async () => {
    await seedAppointment()

    const res = await request(app()).get('/api/appointments?status=bogus')

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('status')
  })

  it('rejects a malformed ?date= with 400', async () => {
    const res = await request(app()).get('/api/appointments?date=18-08-2026')

    expect(res.status).toBe(400)
  })

  it('rejects a shaped-but-impossible ?date= with 400', async () => {
    const res = await request(app()).get('/api/appointments?date=2026-02-31')

    expect(res.status).toBe(400)
  })

  it('rejects an operator object smuggled through the query string', async () => {
    await seedAppointment()

    // Express parses this into `{ $ne: 'pending' }` — it must never reach the
    // database filter.
    const res = await request(app()).get('/api/appointments?status[$ne]=pending')

    expect(res.status).toBe(400)
  })

  it('ignores unknown query parameters outright', async () => {
    await seedAppointment()

    const res = await request(app()).get('/api/appointments?deletedAt=null&limit=0&sort=whatever')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('does not shadow the Customer receipt route', async () => {
    const { appointment } = await seedAppointment()

    const res = await request(app()).get(`/api/appointments/${appointment.uuid}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(appointment.uuid)
  })
})

describe('PATCH /api/appointments/:id/confirm (F10)', () => {
  it('transitions pending -> confirmed and returns the updated record', async () => {
    const { appointment } = await seedAppointment({ status: 'pending' })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(appointment.uuid)
    expect(res.body.status).toBe('confirmed')
    expect(await Appointment.findOne({ uuid: appointment.uuid }).then((d) => d!.status)).toBe(
      'confirmed',
    )
  })

  it('does not touch the TimeSlot — confirming changes nothing about the booking', async () => {
    const { appointment, slot } = await seedAppointment({ status: 'pending' })

    await request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`)

    expect(await TimeSlot.findOne({ uuid: slot.uuid }).then((d) => d!.status)).toBe('booked')
  })

  it('returns 409 when the appointment is already confirmed', async () => {
    const { appointment } = await seedAppointment({ status: 'confirmed' })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`)

    expect(res.status).toBe(409)
  })

  it('returns 409 when the appointment is cancelled — no un-cancelling', async () => {
    const { appointment } = await seedAppointment({ status: 'cancelled' })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`)

    expect(res.status).toBe(409)
    expect(await Appointment.findOne({ uuid: appointment.uuid }).then((d) => d!.status)).toBe(
      'cancelled',
    )
  })

  it('returns 404 for an unknown id', async () => {
    const res = await request(app()).patch(`/api/appointments/${UNKNOWN_UUID}/confirm`)

    expect(res.status).toBe(404)
  })

  it('returns 400 for a malformed id, without it reaching a query filter', async () => {
    const res = await request(app()).patch('/api/appointments/not-a-uuid/confirm')

    expect(res.status).toBe(400)
  })

  it('ignores any status a client tries to name in the body', async () => {
    const { appointment } = await seedAppointment({ status: 'pending' })

    const res = await request(app())
      .patch(`/api/appointments/${appointment.uuid}/confirm`)
      .send({ status: 'cancelled' })

    expect(res.status).toBe(200)
    // The endpoint called decided the status, not the body.
    expect(res.body.status).toBe('confirmed')
  })
})

describe('PATCH /api/appointments/:id/cancel (F11)', () => {
  it('transitions pending -> cancelled', async () => {
    const { appointment } = await seedAppointment({ status: 'pending' })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('transitions confirmed -> cancelled', async () => {
    const { appointment } = await seedAppointment({ status: 'confirmed' })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('releases the linked TimeSlot back to open', async () => {
    const { appointment, slot } = await seedAppointment({ status: 'confirmed' })

    await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    const released = await TimeSlot.findOne({ uuid: slot.uuid })
    expect(released!.status).toBe('open')
    expect(released!.heldAt).toBeNull()
  })

  it('makes the freed slot bookable again on the public availability list', async () => {
    const { service, appointment } = await seedAppointment({ status: 'confirmed' })

    const before = await request(app()).get(
      `/api/time-slots?serviceId=${service.uuid}&date=${DATE}`,
    )
    expect(before.body).toEqual([])

    await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    const after = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)
    expect(after.body).toHaveLength(1)
    expect(after.body[0].status).toBe('open')
  })

  it('clears heldAt when releasing a slot that was still only held', async () => {
    const service = await seedService()
    const slot = await TimeSlot.create({
      serviceId: service._id,
      date: DATE,
      startTime: '09:00',
      endTime: '10:30',
      status: 'held',
      heldAt: new Date(),
    })
    const appointment = await Appointment.create({
      serviceId: service._id,
      timeSlotId: slot._id,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      status: 'pending',
    })

    await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    const released = await TimeSlot.findOne({ uuid: slot.uuid })
    expect(released!.status).toBe('open')
    expect(released!.heldAt).toBeNull()
  })

  it('succeeds even if the slot is somehow already open — the cancel is what matters', async () => {
    const { appointment, slot } = await seedAppointment({ status: 'confirmed' })
    await TimeSlot.updateOne({ _id: slot._id }, { $set: { status: 'open' } })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('returns 409 when the appointment is already cancelled', async () => {
    const { appointment } = await seedAppointment({ status: 'cancelled' })

    const res = await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    expect(res.status).toBe(409)
  })

  it('does not re-release the slot on a repeated cancel', async () => {
    const { appointment, slot } = await seedAppointment({ status: 'confirmed' })

    await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)
    // Someone else claims the freed slot in the meantime.
    await TimeSlot.updateOne({ _id: slot._id }, { $set: { status: 'booked' } })
    const second = await request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`)

    expect(second.status).toBe(409)
    // The rejected second cancel must NOT have freed someone else's booking.
    expect(await TimeSlot.findOne({ uuid: slot.uuid }).then((d) => d!.status)).toBe('booked')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await request(app()).patch(`/api/appointments/${UNKNOWN_UUID}/cancel`)

    expect(res.status).toBe(404)
  })

  it('returns 400 for a malformed id', async () => {
    const res = await request(app()).patch('/api/appointments/not-a-uuid/cancel')

    expect(res.status).toBe(400)
  })
})

describe('Admin transitions — concurrency', () => {
  it('resolves two simultaneous cancels to exactly one 200 and one 409', async () => {
    const { appointment, slot } = await seedAppointment({ status: 'confirmed' })

    const results = await Promise.all([
      request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`),
      request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`),
    ])

    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([200, 409])
    // Exactly one release, and the slot ends up open exactly once.
    expect(await TimeSlot.findOne({ uuid: slot.uuid }).then((d) => d!.status)).toBe('open')
  })

  it('resolves two simultaneous confirms to exactly one 200 and one 409', async () => {
    const { appointment } = await seedAppointment({ status: 'pending' })

    const results = await Promise.all([
      request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`),
      request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('lets a confirm and a cancel race to exactly one winner', async () => {
    const { appointment } = await seedAppointment({ status: 'pending' })

    const results = await Promise.all([
      request(app()).patch(`/api/appointments/${appointment.uuid}/confirm`),
      request(app()).patch(`/api/appointments/${appointment.uuid}/cancel`),
    ])

    // Both source-state preconditions admit `pending`, so both CAN win — but
    // never in a way that leaves an ambiguous record: whatever landed second is
    // the stored status, and a cancel always leaves the slot released.
    const stored = await Appointment.findOne({ uuid: appointment.uuid })
    expect(['confirmed', 'cancelled']).toContain(stored!.status)
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true)
  })

  it('lets concurrent cancels of different appointments all succeed', async () => {
    const a = await seedAppointment({ status: 'confirmed', startTime: '09:00' })
    const b = await seedAppointment({ status: 'confirmed', startTime: '11:00' })

    const results = await Promise.all([
      request(app()).patch(`/api/appointments/${a.appointment.uuid}/cancel`),
      request(app()).patch(`/api/appointments/${b.appointment.uuid}/cancel`),
    ])

    expect(results.map((r) => r.status)).toEqual([200, 200])
  })
})
