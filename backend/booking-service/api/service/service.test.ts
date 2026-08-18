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
