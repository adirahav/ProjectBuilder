import { Seat } from '../models/Seat.model.js'
import type { SeatStatus } from '../models/Seat.model.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import * as busService from '../bus/bus.service.js'

/**
 * The **public** seat shape. Passenger identity (`passengerName`,
 * `passengerPhone`, `pickupPointName`) is deliberately absent: the seat map is
 * an unauthenticated surface, so the server must never send one passenger's PII
 * to another. A passenger must be able to see that a seat is occupied without
 * learning who occupies it.
 */
export type PublicSeat = {
  id: string
  busId: string
  label: string
  row: number
  column: number
  status: SeatStatus
}

export function toPublicSeat(seat: any, busUuid: string): PublicSeat {
  return {
    id: seat.uuid,
    busId: busUuid,
    label: seat.position.label,
    row: seat.position.row,
    column: seat.position.column,
    status: seat.status,
  }
}

/**
 * Every seat on the bus with its current status. `.lean()` bypasses the toJSON
 * transform, so the public mapping is applied explicitly — which is also what
 * guarantees no PII field can leak by accident.
 */
export async function listSeatsByBus(busObjectId: unknown, busUuid: string): Promise<PublicSeat[]> {
  const seats = await Seat.find({ busId: busObjectId as any })
    .sort({ 'position.row': 1, 'position.column': 1 })
    .lean()
  return seats.map((seat) => toPublicSeat(seat, busUuid))
}

export type SeatBookingInput = {
  seatId: string
  fullName: string
  phone: string
  pickupPoint: string
}

const ISRAELI_PHONE = /^0\d{8,9}$/
const ALLOWED_BOOKING_FIELDS = new Set(['seatId', 'fullName', 'phone', 'pickupPoint'])

/**
 * Validates the booking body. Error messages never echo the submitted name or
 * phone — they are PII and must not appear in a response or a log line.
 *
 * Unknown fields are rejected outright (`additionalProperties: false` in the
 * contract). That is also what makes it impossible to smuggle a `status` in:
 * the endpoint alone determines the resulting status, never client input.
 */
export function validateBookingInput(body: unknown): SeatBookingInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object')
  }

  const raw = body as Record<string, unknown>

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_BOOKING_FIELDS.has(key)) {
      throw badRequest(`Unexpected field: ${key}`)
    }
  }

  const seatId = raw.seatId
  if (typeof seatId !== 'string' || seatId.trim() === '') {
    throw badRequest('seatId is required')
  }

  const fullNameRaw = raw.fullName
  if (typeof fullNameRaw !== 'string') {
    throw badRequest('fullName is required')
  }
  const fullName = fullNameRaw.trim()
  if (fullName.length < 2 || fullName.length > 120) {
    throw badRequest('fullName must be between 2 and 120 characters')
  }

  const phone = raw.phone
  if (typeof phone !== 'string' || !ISRAELI_PHONE.test(phone)) {
    throw badRequest('phone must be 9-10 digits beginning with 0')
  }

  const pickupPointRaw = raw.pickupPoint
  if (typeof pickupPointRaw !== 'string' || pickupPointRaw.trim() === '') {
    throw badRequest('pickupPoint is required')
  }

  return { seatId: seatId.trim(), fullName, phone, pickupPoint: pickupPointRaw.trim() }
}

/**
 * The passenger `request` action: `available` → `pending` (PRD F4/F5).
 *
 * **Atomicity invariant.** The status check and the write are a single
 * conditional `findOneAndUpdate`: the filter requires `status: 'available'` and
 * the update sets `status: 'pending'` plus the passenger fields. MongoDB
 * evaluates the filter and the update as one indivisible per-document
 * operation, so the database — not this code — decides who wins the race.
 *
 * A read-then-write here would let two concurrent requests both observe
 * `available` and both succeed, double-allocating the seat and silently
 * overwriting the winner's passenger details. When the filter matches zero
 * documents, `findOneAndUpdate` returns null and the loser gets a 409 having
 * mutated nothing.
 *
 * This endpoint can only ever produce `pending` — confirming a seat is an admin
 * action (`approve`), never a side effect of a passenger request.
 */
export async function requestSeat(input: SeatBookingInput): Promise<PublicSeat> {
  const seat = await Seat.findOne({ uuid: input.seatId })
  if (!seat) {
    throw notFound('Seat not found', 'SEAT_NOT_FOUND')
  }

  // The bus is derived server-side from the seat — the client never sends a
  // busId, so it cannot assert a mismatched pair.
  const bus = await busService.findBusById(seat.busId)
  if (!bus) {
    throw notFound('Seat not found', 'SEAT_NOT_FOUND')
  }

  const allowedPickupPoints = busService.pickupPointNames(bus)
  if (!allowedPickupPoints.includes(input.pickupPoint)) {
    throw badRequest('pickupPoint is not a valid pickup point for this bus')
  }

  const claimed = await Seat.findOneAndUpdate(
    { _id: seat._id, status: 'available' },
    {
      $set: {
        status: 'pending',
        passengerName: input.fullName,
        passengerPhone: input.phone,
        pickupPointName: input.pickupPoint,
        requestedAt: new Date(),
      },
    },
    { new: true }
  ).lean()

  if (!claimed) {
    // The precondition did not hold at the instant MongoDB evaluated it:
    // someone else claimed it first, or it was already pending/taken/reserved.
    // Either way nothing was mutated.
    throw conflict('Seat is no longer available', 'SEAT_TAKEN')
  }

  return toPublicSeat(claimed, bus.uuid)
}
