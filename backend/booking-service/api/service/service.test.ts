import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../app.ts'
import * as db from '../lib/db.ts'
import { Service } from '../models/service.model.ts'

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
  await Service.deleteMany({})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const app = () => createApp()

async function seedService(overrides: Record<string, unknown> = {}) {
  return Service.create({
    name: 'Full groom — small dog',
    durationMinutes: 90,
    price: 220,
    ...overrides,
  })
}

describe('GET /api/services', () => {
  it('returns 200 and an empty array when no Services exist', async () => {
    const res = await request(app()).get('/api/services')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('requires no authentication', async () => {
    await seedService()

    const res = await request(app()).get('/api/services')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('returns each Service with exactly the contract fields and no others', async () => {
    const created = await seedService()

    const res = await request(app()).get('/api/services')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      {
        id: created.uuid,
        name: 'Full groom — small dog',
        durationMinutes: 90,
        price: 220,
        isActive: true,
      },
    ])
  })

  it('never leaks the internal _id, __v, createdAt or deletedAt', async () => {
    await seedService()

    const res = await request(app()).get('/api/services')

    const [service] = res.body
    expect(service).not.toHaveProperty('_id')
    expect(service).not.toHaveProperty('__v')
    expect(service).not.toHaveProperty('uuid')
    expect(service).not.toHaveProperty('createdAt')
    expect(service).not.toHaveProperty('deletedAt')
    // The exposed id is the uuid, not a Mongo ObjectId.
    expect(mongoose.isValidObjectId(service.id)).toBe(false)
  })

  it('excludes inactive Services but leaves their documents in the database', async () => {
    const active = await seedService({ name: 'Bath and blow dry' })
    const inactive = await seedService({ name: 'Deactivated groom', isActive: false })

    const res = await request(app()).get('/api/services')

    expect(res.body.map((s: { id: string }) => s.id)).toEqual([active.uuid])
    // Soft delete, not a hard delete — the record still exists.
    expect(await Service.findOne({ uuid: inactive.uuid })).not.toBeNull()
  })

  it('excludes soft-deleted (deletedAt set) Services via the schema hook', async () => {
    const kept = await seedService({ name: 'Kept' })
    await seedService({ name: 'Removed', deletedAt: new Date() })

    const res = await request(app()).get('/api/services')

    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Kept'])
    expect(res.body[0].id).toBe(kept.uuid)
  })

  it('ignores query parameters instead of merging them into the database filter', async () => {
    const active = await seedService({ name: 'Only active' })
    await seedService({ name: 'Hidden', isActive: false })

    // A crafted query string must not widen the filter or inject an operator.
    const res = await request(app()).get(
      '/api/services?isActive=false&name[$ne]=x&deletedAt[$ne]=null',
    )

    expect(res.status).toBe(200)
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([active.uuid])
  })

  it('returns 503 with a clean error envelope when the database is unreachable', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).get('/api/services')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean error envelope when the query fails unexpectedly', async () => {
    vi.spyOn(Service, 'find').mockImplementation(() => {
      throw new Error('boom: raw mongoose failure with internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).get('/api/services')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('GET /api/services/all (Admin, F6-F8 list)', () => {
  it('returns 200 and an empty array when no Services exist', async () => {
    const res = await request(app()).get('/api/services/all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns inactive Services alongside active ones, unlike the public list', async () => {
    const active = await seedService({ name: 'Active groom' })
    const inactive = await seedService({ name: 'Deactivated groom', isActive: false })

    const res = await request(app()).get('/api/services/all')

    expect(res.status).toBe(200)
    const ids = res.body.map((s: { id: string }) => s.id)
    expect(ids).toHaveLength(2)
    expect(ids).toContain(active.uuid)
    expect(ids).toContain(inactive.uuid)

    // The public list is unchanged by this addition.
    const publicRes = await request(app()).get('/api/services')
    expect(publicRes.body.map((s: { id: string }) => s.id)).toEqual([active.uuid])
  })

  it('is not shadowed by the PATCH /:id route — "all" is never treated as an id', async () => {
    await seedService()

    const res = await request(app()).get('/api/services/all')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('still excludes soft-deleted (deletedAt set) Services', async () => {
    const kept = await seedService({ name: 'Kept' })
    await seedService({ name: 'Removed', deletedAt: new Date() })

    const res = await request(app()).get('/api/services/all')

    expect(res.body.map((s: { id: string }) => s.id)).toEqual([kept.uuid])
  })

  it('returns exactly the contract fields and never internal ones', async () => {
    await seedService({ isActive: false })

    const res = await request(app()).get('/api/services/all')

    expect(Object.keys(res.body[0]).sort()).toEqual(
      ['durationMinutes', 'id', 'isActive', 'name', 'price'].sort(),
    )
  })

  it('returns 503 when the database is unreachable', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).get('/api/services/all')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the query fails unexpectedly', async () => {
    vi.spyOn(Service, 'find').mockImplementation(() => {
      throw new Error('boom: raw mongoose failure with internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).get('/api/services/all')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('POST /api/services (Admin, F6 create)', () => {
  const validBody = { name: 'Nail trim', durationMinutes: 20, price: 60 }

  it('creates the Service and returns 201 with the contract fields', async () => {
    const res = await request(app()).post('/api/services').send(validBody)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      name: 'Nail trim',
      durationMinutes: 20,
      price: 60,
      // Always active on create — never taken from the body.
      isActive: true,
    })
    expect(await Service.countDocuments({ name: 'Nail trim' })).toBe(1)
  })

  it('appears on the public list immediately after creation', async () => {
    const created = await request(app()).post('/api/services').send(validBody)

    const res = await request(app()).get('/api/services')
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([created.body.id])
  })

  it('ignores isActive in the body — a new Service is always active', async () => {
    const res = await request(app())
      .post('/api/services')
      .send({ ...validBody, isActive: false })

    expect(res.status).toBe(201)
    expect(res.body.isActive).toBe(true)
  })

  it('ignores unknown and internal fields in the body', async () => {
    const res = await request(app())
      .post('/api/services')
      .send({ ...validBody, deletedAt: new Date().toISOString(), uuid: 'attacker-chosen', nope: 1 })

    expect(res.status).toBe(201)
    expect(res.body.id).not.toBe('attacker-chosen')
    expect(res.body).not.toHaveProperty('deletedAt')
    expect(res.body).not.toHaveProperty('nope')

    const stored = await Service.findOne({ uuid: res.body.id })
    expect(stored?.deletedAt).toBeNull()
  })

  it.each([
    ['missing name', { durationMinutes: 20, price: 60 }],
    ['blank name', { name: '   ', durationMinutes: 20, price: 60 }],
    ['non-string name', { name: 42, durationMinutes: 20, price: 60 }],
    ['operator object as name', { name: { $ne: null }, durationMinutes: 20, price: 60 }],
    ['missing durationMinutes', { name: 'x', price: 60 }],
    ['zero durationMinutes', { name: 'x', durationMinutes: 0, price: 60 }],
    ['negative durationMinutes', { name: 'x', durationMinutes: -5, price: 60 }],
    ['fractional durationMinutes', { name: 'x', durationMinutes: 20.5, price: 60 }],
    ['numeric-string durationMinutes', { name: 'x', durationMinutes: '20', price: 60 }],
    ['missing price', { name: 'x', durationMinutes: 20 }],
    ['negative price', { name: 'x', durationMinutes: 20, price: -1 }],
    ['numeric-string price', { name: 'x', durationMinutes: 20, price: '60' }],
  ])('rejects %s with 400 and creates nothing', async (_label, body) => {
    const res = await request(app()).post('/api/services').send(body)

    expect(res.status).toBe(400)
    expect(Object.keys(res.body)).toEqual(['error'])
    expect(await Service.countDocuments({})).toBe(0)
  })

  it('accepts a price of 0 (a free treatment is valid)', async () => {
    const res = await request(app())
      .post('/api/services')
      .send({ name: 'Free consult', durationMinutes: 10, price: 0 })

    expect(res.status).toBe(201)
    expect(res.body.price).toBe(0)
  })

  it('returns 503 when the database is unreachable', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).post('/api/services').send(validBody)

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the insert fails unexpectedly', async () => {
    vi.spyOn(Service, 'create').mockRejectedValue(new Error('boom: raw mongoose internals'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).post('/api/services').send(validBody)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('PATCH /api/services/:id (Admin, F7 edit)', () => {
  it('updates only the fields provided and leaves the rest untouched', async () => {
    const created = await seedService()

    const res = await request(app())
      .patch(`/api/services/${created.uuid}`)
      .send({ price: 250 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: created.uuid,
      name: 'Full groom — small dog',
      durationMinutes: 90,
      price: 250,
      isActive: true,
    })
  })

  it('persists the change', async () => {
    const created = await seedService()

    await request(app())
      .patch(`/api/services/${created.uuid}`)
      .send({ name: 'Renamed', durationMinutes: 45 })

    const stored = await Service.findOne({ uuid: created.uuid })
    expect(stored?.name).toBe('Renamed')
    expect(stored?.durationMinutes).toBe(45)
    expect(stored?.price).toBe(220)
  })

  it('can reactivate a deactivated Service via isActive: true (Open Question 3)', async () => {
    const created = await seedService({ isActive: false })

    const res = await request(app())
      .patch(`/api/services/${created.uuid}`)
      .send({ isActive: true })

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(true)

    const publicRes = await request(app()).get('/api/services')
    expect(publicRes.body.map((s: { id: string }) => s.id)).toEqual([created.uuid])
  })

  it('ignores unknown and internal fields — deletedAt and uuid are never patchable', async () => {
    const created = await seedService()

    const res = await request(app())
      .patch(`/api/services/${created.uuid}`)
      .send({ deletedAt: new Date().toISOString(), uuid: 'attacker-chosen', createdAt: 0, x: 1 })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(created.uuid)

    const stored = await Service.findOne({ uuid: created.uuid })
    expect(stored).not.toBeNull()
    expect(stored?.deletedAt).toBeNull()
    expect(stored?.uuid).toBe(created.uuid)
  })

  it('accepts an empty patch as a no-op and returns the unchanged Service', async () => {
    const created = await seedService()

    const res = await request(app()).patch(`/api/services/${created.uuid}`).send({})

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Full groom — small dog')
  })

  it('returns 404 for a well-formed uuid that matches no Service', async () => {
    await seedService()

    const res = await request(app())
      .patch('/api/services/8f1c2b34-5d6e-4f70-8a91-2b3c4d5e6f70')
      .send({ price: 1 })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('returns 404 for a soft-deleted Service rather than resurrecting it', async () => {
    const removed = await seedService({ deletedAt: new Date() })

    const res = await request(app())
      .patch(`/api/services/${removed.uuid}`)
      .send({ price: 1 })

    expect(res.status).toBe(404)
  })

  it('returns 400 for a malformed id instead of querying with it', async () => {
    const res = await request(app()).patch('/api/services/not-a-uuid').send({ price: 1 })

    expect(res.status).toBe(400)
    expect(Object.keys(res.body)).toEqual(['error'])
  })

  it.each([
    ['blank name', { name: '  ' }],
    ['non-string name', { name: 7 }],
    ['zero durationMinutes', { durationMinutes: 0 }],
    ['fractional durationMinutes', { durationMinutes: 1.5 }],
    ['negative price', { price: -0.01 }],
    ['non-boolean isActive', { isActive: 'true' }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const created = await seedService()

    const res = await request(app()).patch(`/api/services/${created.uuid}`).send(body)

    expect(res.status).toBe(400)
    const stored = await Service.findOne({ uuid: created.uuid })
    expect(stored?.name).toBe('Full groom — small dog')
    expect(stored?.durationMinutes).toBe(90)
    expect(stored?.price).toBe(220)
    expect(stored?.isActive).toBe(true)
  })

  it('returns 503 when the database is unreachable', async () => {
    const created = await seedService()
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).patch(`/api/services/${created.uuid}`).send({ price: 1 })

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the update fails unexpectedly', async () => {
    const created = await seedService()
    vi.spyOn(Service, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('boom: raw mongoose internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).patch(`/api/services/${created.uuid}`).send({ price: 1 })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('PATCH /api/services/:id/deactivate (Admin, F8 soft delete)', () => {
  it('sets isActive to false and returns the updated Service', async () => {
    const created = await seedService()

    const res = await request(app()).patch(`/api/services/${created.uuid}/deactivate`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: created.uuid,
      name: 'Full groom — small dog',
      durationMinutes: 90,
      price: 220,
      isActive: false,
    })
  })

  it('removes it from the public list but keeps it in the Admin list', async () => {
    const created = await seedService()

    await request(app()).patch(`/api/services/${created.uuid}/deactivate`)

    const publicRes = await request(app()).get('/api/services')
    expect(publicRes.body).toEqual([])

    const adminRes = await request(app()).get('/api/services/all')
    expect(adminRes.body.map((s: { id: string }) => s.id)).toEqual([created.uuid])
  })

  it('is a soft delete — the document survives and deletedAt stays null', async () => {
    const created = await seedService()

    await request(app()).patch(`/api/services/${created.uuid}/deactivate`)

    const stored = await Service.findOne({ uuid: created.uuid })
    expect(stored).not.toBeNull()
    expect(stored?.isActive).toBe(false)
    expect(stored?.deletedAt).toBeNull()
  })

  it('ignores any request body — the resulting status is never client-controlled', async () => {
    const created = await seedService()

    const res = await request(app())
      .patch(`/api/services/${created.uuid}/deactivate`)
      .send({ isActive: true })

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
  })

  it('is idempotent — deactivating an already inactive Service still returns 200', async () => {
    const created = await seedService({ isActive: false })

    const res = await request(app()).patch(`/api/services/${created.uuid}/deactivate`)

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
  })

  it('does not cascade — it never touches other Services', async () => {
    const target = await seedService({ name: 'Target' })
    const other = await seedService({ name: 'Other' })

    await request(app()).patch(`/api/services/${target.uuid}/deactivate`)

    expect((await Service.findOne({ uuid: other.uuid }))?.isActive).toBe(true)
  })

  it('returns 404 for a well-formed uuid that matches no Service', async () => {
    const res = await request(app()).patch(
      '/api/services/8f1c2b34-5d6e-4f70-8a91-2b3c4d5e6f70/deactivate',
    )

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('returns 400 for a malformed id', async () => {
    const res = await request(app()).patch('/api/services/not-a-uuid/deactivate')

    expect(res.status).toBe(400)
    expect(Object.keys(res.body)).toEqual(['error'])
  })

  it('returns 503 when the database is unreachable', async () => {
    const created = await seedService()
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)

    const res = await request(app()).patch(`/api/services/${created.uuid}/deactivate`)

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Service Unavailable' })
  })

  it('returns 500 with a clean envelope when the update fails unexpectedly', async () => {
    const created = await seedService()
    vi.spyOn(Service, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('boom: raw mongoose internals')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app()).patch(`/api/services/${created.uuid}/deactivate`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })
})

describe('Service model', () => {
  it('requires name, durationMinutes and price', async () => {
    await expect(Service.create({ name: 'Missing the rest' })).rejects.toThrow()
  })

  it('defaults isActive to true, deletedAt to null and generates a uuid', async () => {
    const created = await seedService()

    expect(created.isActive).toBe(true)
    expect(created.deletedAt).toBeNull()
    expect(created.uuid).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
