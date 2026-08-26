import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../api/app.js'
import { Tour } from '../api/models/Tour.model.js'
import { buildBus, buildTour } from './factories.js'

const app = createApp()

describe('GET /api/tours', () => {
  it('returns an empty list as a 200, not a 404', async () => {
    const res = await request(app).get('/api/tours')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tours: [] })
  })

  it('returns tours sorted by startDate ascending, independent of insertion order', async () => {
    await buildTour({ name: 'later', date: new Date('2026-10-02'), endDate: null })
    await buildTour({ name: 'earlier', date: new Date('2026-09-14') })

    const res = await request(app).get('/api/tours')

    expect(res.status).toBe(200)
    expect(res.body.tours.map((t: any) => t.name)).toEqual(['earlier', 'later'])
  })

  it('serializes the contract shape: id/name/startDate/endDate and no _id', async () => {
    await buildTour({ name: 'הגליל העליון' })

    const res = await request(app).get('/api/tours')
    const tour = res.body.tours[0]

    expect(Object.keys(tour).sort()).toEqual(['endDate', 'id', 'name', 'startDate'])
    expect(tour.startDate).toBe('2026-09-14')
    expect(tour.endDate).toBe('2026-09-16')
    expect(tour.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns null endDate for a same-day tour', async () => {
    await buildTour({ endDate: null })

    const res = await request(app).get('/api/tours')

    expect(res.body.tours[0].endDate).toBeNull()
  })

  it('excludes soft-deleted tours from the list while the document still exists', async () => {
    const kept = await buildTour({ name: 'kept' })
    const deleted = await buildTour({ name: 'deleted' })
    await Tour.updateOne({ _id: deleted._id }, { deletedAt: new Date() })

    const res = await request(app).get('/api/tours')

    expect(res.body.tours.map((t: any) => t.id)).toEqual([kept.uuid])
    // Soft delete, not a hard delete: the document is still there.
    const raw = await Tour.collection.findOne({ _id: deleted._id })
    expect(raw).not.toBeNull()
  })
})

describe('GET /api/tours/:tourId/buses', () => {
  it('returns 404 TOUR_NOT_FOUND for an unknown tourId', async () => {
    const res = await request(app).get('/api/tours/3f8a1b20-5c4d-4e11-9a7f-2b6c8d0e1f33/buses')

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('TOUR_NOT_FOUND')
  })

  it('returns 404 for a soft-deleted tour rather than an empty list', async () => {
    const tour = await buildTour()
    await Tour.updateOne({ _id: tour._id }, { deletedAt: new Date() })

    const res = await request(app).get(`/api/tours/${tour.uuid}/buses`)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('TOUR_NOT_FOUND')
  })

  it('returns 200 with an empty list when the tour exists but has no buses', async () => {
    const tour = await buildTour()

    const res = await request(app).get(`/api/tours/${tour.uuid}/buses`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ buses: [] })
  })

  it('returns the tour"s buses with pickupPoints flattened and ordered', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)

    const res = await request(app).get(`/api/tours/${tour.uuid}/buses`)

    expect(res.status).toBe(200)
    expect(res.body.buses).toHaveLength(1)
    expect(res.body.buses[0]).toEqual({
      id: bus.uuid,
      tourId: tour.uuid,
      name: 'אוטובוס 1',
      seatCount: 4,
      // Sorted by `order`, not by insertion order.
      pickupPoints: ['תחנה מרכזית תל אביב', 'צומת גלילות'],
    })
  })

  it('excludes buses belonging to a different tour', async () => {
    const tourA = await buildTour({ name: 'A' })
    const tourB = await buildTour({ name: 'B' })
    await buildBus(tourA._id, { name: 'bus-a' })
    await buildBus(tourB._id, { name: 'bus-b' })

    const res = await request(app).get(`/api/tours/${tourA.uuid}/buses`)

    expect(res.body.buses.map((b: any) => b.name)).toEqual(['bus-a'])
  })

  it('excludes soft-deleted buses from the list', async () => {
    const tour = await buildTour()
    const kept = await buildBus(tour._id, { name: 'kept' })
    await buildBus(tour._id, { name: 'deleted', deletedAt: new Date() })

    const res = await request(app).get(`/api/tours/${tour.uuid}/buses`)

    expect(res.body.buses.map((b: any) => b.id)).toEqual([kept.uuid])
  })

  it('rejects an invalid bus with a validation error rather than persisting it', async () => {
    const tour = await buildTour()

    // seatCount is required and must be >= 1
    await expect(buildBus(tour._id, { seatCount: 0 })).rejects.toThrow()
    await expect(buildBus(tour._id, { name: undefined })).rejects.toThrow()
  })
})
