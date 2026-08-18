import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../app.ts'
import * as db from '../lib/db.ts'
import { HOLD_TTL_MS } from '../lib/config.ts'
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
  await Promise.all([Service.deleteMany({}), TimeSlot.deleteMany({})])
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

async function seedSlot(
  service: { _id: mongoose.Types.ObjectId },
  overrides: Record<string, unknown> = {},
) {
  return TimeSlot.create({
    serviceId: service._id,
    date: DATE,
    startTime: '09:00',
    endTime: '10:30',
    ...overrides,
  })
}

describe('GET /api/time-slots', () => {
  it('returns 200 and an empty array when the day has no slots', async () => {
    const service = await seedService()

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('requires no authentication', async () => {
    const service = await seedService()
    await seedSlot(service)

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('returns each slot with exactly the contract fields and no others', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      {
        id: slot.uuid,
        serviceId: service.uuid,
        date: DATE,
        startTime: '09:00',
        endTime: '10:30',
        status: 'open',
      },
    ])
  })

  it('never leaks _id, __v, uuid, heldAt or createdAt', async () => {
    const service = await seedService()
    await seedSlot(service, { status: 'held', heldAt: new Date(Date.now() - HOLD_TTL_MS - 1000) })

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    const [slot] = res.body
    expect(slot).not.toHaveProperty('_id')
    expect(slot).not.toHaveProperty('__v')
    expect(slot).not.toHaveProperty('uuid')
    // The hold deadline is server-side bookkeeping and must never be exposed.
    expect(slot).not.toHaveProperty('heldAt')
    expect(slot).not.toHaveProperty('createdAt')
    expect(mongoose.isValidObjectId(slot.id)).toBe(false)
    // serviceId is the Service's uuid, never its internal ObjectId.
    expect(mongoose.isValidObjectId(slot.serviceId)).toBe(false)
  })

  it('excludes held and booked slots', async () => {
    const service = await seedService()
    const open = await seedSlot(service, { startTime: '09:00' })
    await seedSlot(service, { startTime: '11:00', status: 'held', heldAt: new Date() })
    await seedSlot(service, { startTime: '13:00', status: 'booked' })

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.body.map((s: { id: string }) => s.id)).toEqual([open.uuid])
  })

  it('returns a held slot whose hold has expired as available, and heals it to open', async () => {
    const service = await seedService()
    const stale = await seedSlot(service, {
      status: 'held',
      heldAt: new Date(Date.now() - HOLD_TTL_MS - 1000),
    })

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(stale.uuid)
    expect(res.body[0].status).toBe('open')

    // The read is what heals the stale hold — there is no sweeper job yet.
    const healed = await TimeSlot.findOne({ uuid: stale.uuid })
    expect(healed?.status).toBe('open')
    expect(healed?.heldAt).toBeNull()
  })

  it('does not expire a hold that is still within the TTL', async () => {
    const service = await seedService()
    const fresh = await seedSlot(service, {
      status: 'held',
      heldAt: new Date(Date.now() - 1000),
    })

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.body).toEqual([])
    expect((await TimeSlot.findOne({ uuid: fresh.uuid }))?.status).toBe('held')
  })

  it('excludes slots belonging to another Service or another day', async () => {
    const service = await seedService()
    const other = await seedService({ name: 'Bath and blow dry' })
    const wanted = await seedSlot(service)
    await seedSlot(other, { startTime: '15:00' })
    await seedSlot(service, { date: '2026-08-19', startTime: '15:00' })

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.body.map((s: { id: string }) => s.id)).toEqual([wanted.uuid])
  })

  it('returns an empty array for a deactivated Service rather than exposing its slots', async () => {
    const service = await seedService({ isActive: false })
    await seedSlot(service)

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns an empty array for an unknown but well-formed serviceId', async () => {
    const res = await request(app()).get(
      `/api/time-slots?serviceId=${crypto.randomUUID()}&date=${DATE}`,
    )

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('sorts slots by start time', async () => {
    const service = await seedService()
    await seedSlot(service, { startTime: '13:00' })
    await seedSlot(service, { startTime: '09:00' })
    await seedSlot(service, { startTime: '11:00' })

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.body.map((s: { startTime: string }) => s.startTime)).toEqual([
      '09:00',
      '11:00',
      '13:00',
    ])
  })

  it('returns 400 when serviceId is missing', async () => {
    const res = await request(app()).get(`/api/time-slots?date=${DATE}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTypeOf('string')
  })

  it('returns 400 when date is missing', async () => {
    const service = await seedService()

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}`)

    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed serviceId instead of coercing it', async () => {
    const res = await request(app()).get(`/api/time-slots?serviceId=not-a-uuid&date=${DATE}`)

    expect(res.status).toBe(400)
  })

  it.each(['18-08-2026', '2026-8-18', '2026-13-01', '2026-02-31', 'today', ''])(
    'returns 400 for the malformed date %j',
    async (date) => {
      const service = await seedService()

      const res = await request(app()).get(
        `/api/time-slots?serviceId=${service.uuid}&date=${encodeURIComponent(date)}`,
      )

      expect(res.status).toBe(400)
    },
  )

  it('rejects an injected operator object instead of merging it into the filter', async () => {
    const service = await seedService()
    await seedSlot(service, { status: 'booked' })

    // `serviceId[$ne]=x` arrives as an object — it must never reach the filter.
    const res = await request(app()).get(
      `/api/time-slots?serviceId[$ne]=x&date[$ne]=x&status[$ne]=open`,
    )

    expect(res.status).toBe(400)
  })

  it('ignores an unexpected status query parameter rather than trusting it', async () => {
    const service = await seedService()
    await seedSlot(service, { status: 'booked' })

    // A client asking for booked slots must still get only open ones.
    const res = await request(app()).get(
      `/api/time-slots?serviceId=${service.uuid}&date=${DATE}&status=booked`,
    )

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 503 with a clean envelope when the database is unreachable', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).get(`/api/time-slots?serviceId=${crypto.randomUUID()}&date=${DATE}`)

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the query fails unexpectedly', async () => {
    const service = await seedService()
    vi.spyOn(TimeSlot, 'updateMany').mockImplementation(() => {
      throw new Error('boom: raw mongoose failure with internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).get(`/api/time-slots?serviceId=${service.uuid}&date=${DATE}`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('POST /api/time-slots/:id/hold', () => {
  it('holds an open slot, returns 200 and the updated slot', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const res = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: slot.uuid,
      serviceId: service.uuid,
      date: DATE,
      startTime: '09:00',
      endTime: '10:30',
      status: 'held',
    })
  })

  it('requires no authentication and no request body', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const res = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    expect(res.status).toBe(200)
  })

  it('persists the held status and stamps heldAt', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    const stored = await TimeSlot.findOne({ uuid: slot.uuid })
    expect(stored?.status).toBe('held')
    expect(stored?.heldAt).toBeInstanceOf(Date)
  })

  it('never leaks heldAt or internal fields in the response', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const res = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    expect(res.body).not.toHaveProperty('heldAt')
    expect(res.body).not.toHaveProperty('_id')
    expect(res.body).not.toHaveProperty('__v')
    expect(res.body).not.toHaveProperty('uuid')
  })

  it('returns 409 when the slot is already held, leaving the original hold intact', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const first = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)
    const heldAtAfterFirst = (await TimeSlot.findOne({ uuid: slot.uuid }))?.heldAt

    const second = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(second.body).toEqual({ error: 'TimeSlot is no longer open' })

    // Not double-held or corrupted — still exactly the first hold.
    const stored = await TimeSlot.findOne({ uuid: slot.uuid })
    expect(stored?.status).toBe('held')
    expect(stored?.heldAt?.getTime()).toBe(heldAtAfterFirst?.getTime())
  })

  it('returns 409 for a booked slot and does not downgrade it to held', async () => {
    const service = await seedService()
    const slot = await seedSlot(service, { status: 'booked' })

    const res = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    expect(res.status).toBe(409)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('booked')
  })

  it('allows re-holding a slot whose previous hold has expired', async () => {
    const service = await seedService()
    const slot = await seedSlot(service, {
      status: 'held',
      heldAt: new Date(Date.now() - HOLD_TTL_MS - 1000),
    })

    const res = await request(app()).post(`/api/time-slots/${slot.uuid}/hold`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('held')

    // The stamp was refreshed, so the new holder gets a full TTL.
    const stored = await TimeSlot.findOne({ uuid: slot.uuid })
    expect(stored!.heldAt!.getTime()).toBeGreaterThan(Date.now() - HOLD_TTL_MS)
  })

  it('returns 404 for a well-formed id that matches no slot', async () => {
    const res = await request(app()).post(`/api/time-slots/${crypto.randomUUID()}/hold`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('returns 400 for a malformed id', async () => {
    const res = await request(app()).post('/api/time-slots/not-a-uuid/hold')

    expect(res.status).toBe(400)
  })

  it('ignores a status supplied in the request body — the endpoint decides the status', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const res = await request(app())
      .post(`/api/time-slots/${slot.uuid}/hold`)
      .send({ status: 'booked', heldAt: null })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('held')
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
  })

  it('returns 503 with a clean envelope when the database is unreachable', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).post(`/api/time-slots/${crypto.randomUUID()}/hold`)

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the update fails unexpectedly', async () => {
    vi.spyOn(TimeSlot, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('boom: raw mongoose failure with internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).post(`/api/time-slots/${crypto.randomUUID()}/hold`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

// The reason booking-service is in this plan's scope at all. A sequential pair
// of requests proves nothing about the race — these must be fired together.
describe('POST /api/time-slots/:id/hold — concurrency', () => {
  it('allows exactly one of two simultaneous holds for the same slot', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const results = await Promise.all([
      request(app()).post(`/api/time-slots/${slot.uuid}/hold`),
      request(app()).post(`/api/time-slots/${slot.uuid}/hold`),
    ])

    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(1)

    // Exactly one customer's hold made it in — never both, never neither.
    const stored = await TimeSlot.findOne({ uuid: slot.uuid })
    expect(stored?.status).toBe('held')
  })

  it('allows exactly one winner across many simultaneous holds', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    const results = await Promise.all(
      Array.from({ length: 12 }, () => request(app()).post(`/api/time-slots/${slot.uuid}/hold`)),
    )

    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(11)
    expect((await TimeSlot.findOne({ uuid: slot.uuid }))?.status).toBe('held')
  })

  it('lets concurrent holds on different slots all succeed', async () => {
    const service = await seedService()
    const a = await seedSlot(service, { startTime: '09:00' })
    const b = await seedSlot(service, { startTime: '11:00' })

    const results = await Promise.all([
      request(app()).post(`/api/time-slots/${a.uuid}/hold`),
      request(app()).post(`/api/time-slots/${b.uuid}/hold`),
    ])

    // Exclusivity is per-slot — it must not serialize unrelated customers.
    expect(results.map((r) => r.status)).toEqual([200, 200])
  })

  it('allows exactly one winner when two requests race to re-hold an expired slot', async () => {
    const service = await seedService()
    const slot = await seedSlot(service, {
      status: 'held',
      heldAt: new Date(Date.now() - HOLD_TTL_MS - 1000),
    })

    const results = await Promise.all([
      request(app()).post(`/api/time-slots/${slot.uuid}/hold`),
      request(app()).post(`/api/time-slots/${slot.uuid}/hold`),
    ])

    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(1)
  })
})

describe('TimeSlot model', () => {
  it('requires serviceId, date, startTime and endTime', async () => {
    await expect(TimeSlot.create({ date: DATE })).rejects.toThrow()
  })

  it('defaults status to open, heldAt to null and generates a uuid', async () => {
    const service = await seedService()
    const slot = await seedSlot(service)

    expect(slot.status).toBe('open')
    expect(slot.heldAt).toBeNull()
    expect(slot.uuid).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('rejects a status outside the open/held/booked enum', async () => {
    const service = await seedService()

    await expect(seedSlot(service, { status: 'cancelled' })).rejects.toThrow()
  })
})
