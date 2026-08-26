import { describe, expect, it, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../api/app.js'
import { Bus } from '../api/models/Bus.model.js'
import { Seat, type SeatStatus } from '../api/models/Seat.model.js'
import { buildBus, buildSeat, buildTour, validPassenger } from './factories.js'

const app = createApp()

let tour: any
let bus: any

beforeEach(async () => {
  tour = await buildTour()
  bus = await buildBus(tour._id)
})

const post = (body: unknown) => request(app).post('/api/seats/bookings').send(body as any)

describe('POST /api/seats/bookings — happy path', () => {
  it('claims an available seat, moving it to pending', async () => {
    const seat = await buildSeat(bus._id, { status: 'available' })

    const res = await post({ seatId: seat.uuid, ...validPassenger })

    expect(res.status).toBe(201)
    expect(res.body.seat).toEqual({
      id: seat.uuid,
      busId: bus.uuid,
      label: '1',
      row: 1,
      column: 1,
      status: 'pending',
    })
  })

  it('persists the passenger details and requestedAt for the admin to approve later', async () => {
    const seat = await buildSeat(bus._id)

    await post({ seatId: seat.uuid, ...validPassenger })

    const stored = await Seat.findById(seat._id)
    expect(stored!.status).toBe('pending')
    expect(stored!.passengerName).toBe(validPassenger.fullName)
    expect(stored!.passengerPhone).toBe(validPassenger.phone)
    expect(stored!.pickupPointName).toBe(validPassenger.pickupPoint)
    expect(stored!.requestedAt).toBeInstanceOf(Date)
  })

  it('never produces a taken seat — confirmation is an admin action', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger })

    expect(res.body.seat.status).toBe('pending')
    expect((await Seat.findById(seat._id))!.status).not.toBe('taken')
  })

  it('does not echo the passenger name or phone back in the response', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger })
    const body = JSON.stringify(res.body)

    expect(body).not.toContain(validPassenger.fullName)
    expect(body).not.toContain(validPassenger.phone)
    expect(body).not.toContain(validPassenger.pickupPoint)
  })

  it('trims surrounding whitespace from the submitted name', async () => {
    const seat = await buildSeat(bus._id)

    await post({ seatId: seat.uuid, ...validPassenger, fullName: '  דנה לוי  ' })

    expect((await Seat.findById(seat._id))!.passengerName).toBe('דנה לוי')
  })
})

describe('POST /api/seats/bookings — validation (400)', () => {
  it.each([
    ['seatId missing', { fullName: 'דנה לוי', phone: '0524471903', pickupPoint: 'צומת גלילות' }],
    ['fullName missing', { seatId: 'x', phone: '0524471903', pickupPoint: 'צומת גלילות' }],
    ['phone missing', { seatId: 'x', fullName: 'דנה לוי', pickupPoint: 'צומת גלילות' }],
    ['pickupPoint missing', { seatId: 'x', fullName: 'דנה לוי', phone: '0524471903' }],
  ])('rejects when %s', async (_label, body) => {
    const res = await post(body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a fullName shorter than 2 characters', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger, fullName: 'א' })

    expect(res.status).toBe(400)
  })

  it('rejects a fullName longer than 120 characters', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger, fullName: 'א'.repeat(121) })

    expect(res.status).toBe(400)
  })

  it.each([
    ['too short', '012345'],
    ['too long', '012345678901'],
    ['not starting with 0', '524471903'],
    ['containing separators', '052-447-1903'],
    ['non-numeric', 'not-a-phone'],
  ])('rejects a phone that is %s — the server re-validates rather than trusting the client', async (_label, phone) => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger, phone })

    expect(res.status).toBe(400)
  })

  it('accepts both 9- and 10-digit Israeli local numbers', async () => {
    const seatA = await buildSeat(bus._id, { label: 'a', column: 1 })
    const seatB = await buildSeat(bus._id, { label: 'b', column: 2 })

    expect((await post({ seatId: seatA.uuid, ...validPassenger, phone: '021234567' })).status).toBe(201)
    expect((await post({ seatId: seatB.uuid, ...validPassenger, phone: '0521234567' })).status).toBe(201)
  })

  it('rejects a pickupPoint that is not one of the owning bus"s pickupPoints', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger, pickupPoint: 'ירושלים' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
    expect(res.body.message).toBe('pickupPoint is not a valid pickup point for this bus')
    // Rejected, not silently accepted.
    expect((await Seat.findById(seat._id))!.status).toBe('available')
  })

  it('rejects any pickupPoint when the bus has none defined', async () => {
    const emptyBus = await buildBus(tour._id, { name: 'empty', pickupPoints: [] })
    const seat = await buildSeat(emptyBus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger })

    expect(res.status).toBe(400)
  })

  it('rejects an unknown field, so status can never be smuggled in from the client', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger, status: 'taken' })

    expect(res.status).toBe(400)
    expect((await Seat.findById(seat._id))!.status).toBe('available')
  })

  it('never echoes the submitted name or phone in a validation error message', async () => {
    const seat = await buildSeat(bus._id)

    const res = await post({ seatId: seat.uuid, ...validPassenger, pickupPoint: 'ירושלים' })
    const body = JSON.stringify(res.body)

    expect(body).not.toContain(validPassenger.fullName)
    expect(body).not.toContain(validPassenger.phone)
  })
})

describe('POST /api/seats/bookings — not found (404)', () => {
  it('returns SEAT_NOT_FOUND for an unknown seatId', async () => {
    const res = await post({
      seatId: '5d1c8e77-4b2a-4d90-8e63-0a7f1c9b2d44',
      ...validPassenger,
    })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('SEAT_NOT_FOUND')
  })

  it('returns SEAT_NOT_FOUND when the seat"s owning bus is soft-deleted', async () => {
    const seat = await buildSeat(bus._id)
    await Bus.updateOne({ _id: bus._id }, { deletedAt: new Date() })

    const res = await post({ seatId: seat.uuid, ...validPassenger })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('SEAT_NOT_FOUND')
  })
})

describe('POST /api/seats/bookings — conflict (409)', () => {
  it.each<[SeatStatus]>([['pending'], ['taken'], ['reserved']])(
    'rejects a request against a seat already %s',
    async (status) => {
      const seat = await buildSeat(bus._id, { status })

      const res = await post({ seatId: seat.uuid, ...validPassenger })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SEAT_TAKEN')
    }
  )

  it('mutates nothing when it loses — the existing occupant is left untouched', async () => {
    const seat = await buildSeat(bus._id, { status: 'pending' })
    await Seat.updateOne(
      { _id: seat._id },
      { passengerName: 'ראשון', passengerPhone: '0501111111', pickupPointName: 'צומת גלילות' }
    )

    await post({ seatId: seat.uuid, fullName: 'שני', phone: '0502222222', pickupPoint: 'צומת גלילות' })

    const stored = await Seat.findById(seat._id)
    expect(stored!.status).toBe('pending')
    expect(stored!.passengerName).toBe('ראשון')
    expect(stored!.passengerPhone).toBe('0501111111')
  })
})

describe('POST /api/seats/bookings — concurrency (PRD F5 / AC-6)', () => {
  it('allows exactly one of two simultaneous requests for the same seat', async () => {
    const seat = await buildSeat(bus._id, { status: 'available' })

    // Genuinely simultaneous — fired together, not awaited one after the other.
    // A sequential test would only prove sequential correctness, which was
    // never in question.
    const [a, b] = await Promise.all([
      post({ seatId: seat.uuid, fullName: 'נוסע א', phone: '0501111111', pickupPoint: 'צומת גלילות' }),
      post({ seatId: seat.uuid, fullName: 'נוסע ב', phone: '0502222222', pickupPoint: 'צומת גלילות' }),
    ])

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([201, 409])

    const stored = await Seat.findById(seat._id)
    expect(stored!.status).toBe('pending')
    // Exactly one passenger's details made it in — no silent overwrite.
    expect(['נוסע א', 'נוסע ב']).toContain(stored!.passengerName)
    const winnerPhone = stored!.passengerName === 'נוסע א' ? '0501111111' : '0502222222'
    expect(stored!.passengerPhone).toBe(winnerPhone)
  })

  it('allows exactly one winner across ten simultaneous requests for the same seat', async () => {
    const seat = await buildSeat(bus._id, { status: 'available' })

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post({
          seatId: seat.uuid,
          fullName: `נוסע ${i}`,
          phone: `05000000${String(i).padStart(2, '0')}`,
          pickupPoint: 'צומת גלילות',
        })
      )
    )

    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(results.filter((r) => r.status === 409)).toHaveLength(9)
    expect((await Seat.findById(seat._id))!.status).toBe('pending')
  })

  it('does not conflict when two simultaneous requests target different seats', async () => {
    const seatA = await buildSeat(bus._id, { label: 'a', column: 1 })
    const seatB = await buildSeat(bus._id, { label: 'b', column: 2 })

    const [a, b] = await Promise.all([
      post({ seatId: seatA.uuid, ...validPassenger }),
      post({ seatId: seatB.uuid, ...validPassenger }),
    ])

    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
  })
})
