import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../api/app.js'
import { Bus } from '../api/models/Bus.model.js'
import { Seat } from '../api/models/Seat.model.js'
import { buildBus, buildSeat, buildTour } from './factories.js'

const app = createApp()

describe('GET /api/buses/:busId/seats', () => {
  it('returns 404 BUS_NOT_FOUND for an unknown busId', async () => {
    const res = await request(app).get('/api/buses/b1e7d940-2f36-4c88-a1d2-9e4f6a3b7c50/seats')

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('BUS_NOT_FOUND')
  })

  it('returns 404 for a soft-deleted bus', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    await Bus.updateOne({ _id: bus._id }, { deletedAt: new Date() })

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('BUS_NOT_FOUND')
  })

  it('returns 200 with an empty seats array for a bus with no seats defined', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.status).toBe(200)
    expect(res.body.seats).toEqual([])
    expect(res.body.bus.id).toBe(bus.uuid)
  })

  it('returns the bus layout metadata needed to draw the map', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.body.bus).toEqual({
      id: bus.uuid,
      name: 'אוטובוס 1',
      seatCount: 4,
      pickupPoints: ['תחנה מרכזית תל אביב', 'צומת גלילות'],
      aisleAfterColumn: 2,
      doorRow: 3,
      backRow: 13,
    })
  })

  it('nulls layout affordances that the bus does not define', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id, { seatLayout: {} })

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.body.bus.aisleAfterColumn).toBeNull()
    expect(res.body.bus.doorRow).toBeNull()
    expect(res.body.bus.backRow).toBeNull()
  })

  it('returns every seat with its current status, ordered by row then column', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    await buildSeat(bus._id, { row: 2, column: 1, label: '3', status: 'taken' })
    await buildSeat(bus._id, { row: 1, column: 2, label: '2', status: 'pending' })
    await buildSeat(bus._id, { row: 1, column: 1, label: '1', status: 'available' })
    await buildSeat(bus._id, { row: 2, column: 2, label: '4', status: 'reserved' })

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.body.seats.map((s: any) => s.label)).toEqual(['1', '2', '3', '4'])
    expect(res.body.seats.map((s: any) => s.status)).toEqual([
      'available',
      'pending',
      'taken',
      'reserved',
    ])
    expect(res.body.seats[0].busId).toBe(bus.uuid)
  })

  it('never exposes passenger PII, even for occupied seats', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'pending' })
    await Seat.updateOne(
      { _id: seat._id },
      {
        passengerName: 'דנה לוי',
        passengerPhone: '0524471903',
        pickupPointName: 'צומת גלילות',
      }
    )

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)
    const returned = res.body.seats[0]

    expect(Object.keys(returned).sort()).toEqual(['busId', 'column', 'id', 'label', 'row', 'status'])
    // Belt and braces: no PII anywhere in the serialized body.
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('דנה לוי')
    expect(body).not.toContain('0524471903')
    expect(body).not.toContain('passengerName')
    expect(body).not.toContain('_id')
  })

  it('excludes seats belonging to another bus', async () => {
    const tour = await buildTour()
    const busA = await buildBus(tour._id, { name: 'A' })
    const busB = await buildBus(tour._id, { name: 'B' })
    await buildSeat(busA._id, { label: 'a1' })
    await buildSeat(busB._id, { label: 'b1' })

    const res = await request(app).get(`/api/buses/${busA.uuid}/seats`)

    expect(res.body.seats.map((s: any) => s.label)).toEqual(['a1'])
  })

  it('is sent with Cache-Control: no-store, being the sole source of truth for seat state', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    expect(res.headers['cache-control']).toBe('no-store')
  })
})
