import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/tour-service/api/app.js'
import { Seat } from '../../../backend/tour-service/api/models/Seat.model.js'
import { buildBus, buildSeat, buildTour, validPassenger } from '../../../backend/tour-service/__tests__/factories.js'

/**
 * Security regression tests for SEATREQU-SEC (seat-request modal, plan 008).
 *
 * Run from `backend/tour-service` so the existing vitest + mongodb-memory-server
 * setup applies:
 *   npm --prefix backend/tour-service run test -- ../../docs/tests/security/seat-request-modal.security.test.ts
 *
 * This is a targeted security audit of the already-implemented public
 * `POST /api/seats/bookings` endpoint (plan 007). It complements — does not
 * duplicate — `backend/tour-service/__tests__/seatBooking.test.ts`, which
 * already covers the full concurrency/validation/PII matrix. These tests
 * assert the specific CRITICAL-class invariants called out in the security
 * agent's scope: status can't be smuggled in, PII never leaks, and a genuine
 * race produces exactly one winner.
 */

const app = createApp()
const post = (body: unknown) => request(app).post('/api/seats/bookings').send(body as any)

describe('SEATREQU-SEC: seat.status cannot be client-supplied', () => {
  it('ignores/rejects a client-supplied status field rather than writing it to the seat', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await post({ seatId: seat.uuid, ...validPassenger, status: 'taken' })

    expect(res.status).toBe(400)
    const stored = await Seat.findById(seat._id)
    expect(stored!.status).toBe('available')
  })
})

describe('SEATREQU-SEC: concurrency-safe atomic claim (PRD F5 / AC-6)', () => {
  it('exactly one of two truly simultaneous requests for the same seat succeeds', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const [a, b] = await Promise.all([
      post({ seatId: seat.uuid, fullName: 'Passenger A', phone: '0501111111', pickupPoint: 'צומת גלילות' }),
      post({ seatId: seat.uuid, fullName: 'Passenger B', phone: '0502222222', pickupPoint: 'צומת גלילות' }),
    ])

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([201, 409])

    const stored = await Seat.findById(seat._id)
    expect(stored!.status).toBe('pending')
  })

  it('the losing (409) response body carries no seat mutation and no leaked winner PII', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const [a, b] = await Promise.all([
      post({ seatId: seat.uuid, fullName: 'Passenger A', phone: '0501111111', pickupPoint: 'צומת גלילות' }),
      post({ seatId: seat.uuid, fullName: 'Passenger B', phone: '0502222222', pickupPoint: 'צומת גלילות' }),
    ])

    const loser = a.status === 409 ? a : b
    const loserBody = JSON.stringify(loser.body)
    expect(loserBody).not.toContain('Passenger A')
    expect(loserBody).not.toContain('Passenger B')
    expect(loserBody).not.toContain('0501111111')
    expect(loserBody).not.toContain('0502222222')
  })
})

describe('SEATREQU-SEC: passenger PII isolation on the public seat surface', () => {
  it('never returns fullName/phone/pickupPoint in the booking response, win or lose', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await post({ seatId: seat.uuid, ...validPassenger })

    expect(Object.keys(res.body.seat).sort()).toEqual(['busId', 'column', 'id', 'label', 'row', 'status'].sort())
  })

  it('never returns passenger name/phone from the public GET seat-map endpoint, even for a pending seat', async () => {
    // Note: the bus's own `pickupPoints` list (which stops exist for this bus)
    // is legitimately public and appears in the payload regardless — only the
    // passenger's *chosen* pickup point, name, and phone must be absent.
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })
    await post({ seatId: seat.uuid, ...validPassenger })

    const res = await request(app).get(`/api/buses/${bus.uuid}/seats`)

    const seatEntry = res.body.seats.find((s: any) => s.id === seat.uuid)
    expect(seatEntry.status).toBe('pending')
    expect(Object.keys(seatEntry).sort()).toEqual(['busId', 'column', 'id', 'label', 'row', 'status'].sort())
    const body = JSON.stringify(res.body)
    expect(body).not.toContain(validPassenger.fullName)
    expect(body).not.toContain(validPassenger.phone)
  })
})

describe('SEATREQU-SEC: server re-validates pickupPoint against the owning bus', () => {
  it('rejects a pickupPoint not belonging to the seat\'s bus (client cannot forge it)', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await post({ seatId: seat.uuid, ...validPassenger, pickupPoint: 'לא קיים' })

    expect(res.status).toBe(400)
    expect((await Seat.findById(seat._id))!.status).toBe('available')
  })
})

describe('SEATREQU-SEC: request body size / injection surface', () => {
  it('rejects a non-object body (e.g. array/string) instead of 500ing', async () => {
    const res = await post(['not', 'an', 'object'])
    expect([400, 404]).toContain(res.status)
  })

  it('rejects unexpected/extra fields outright rather than silently ignoring them', async () => {
    const tour = await buildTour()
    const bus = await buildBus(tour._id)
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await post({ seatId: seat.uuid, ...validPassenger, isAdmin: true })

    expect(res.status).toBe(400)
  })
})
