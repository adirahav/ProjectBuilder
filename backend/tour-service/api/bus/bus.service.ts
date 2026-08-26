import type { HydratedDocument } from 'mongoose'
import { Bus } from '../models/Bus.model.js'
import { notFound } from '../lib/errors.js'
import * as tourService from '../tour/tour.service.js'
import * as seatService from '../seat/seat.service.js'
import type { PublicSeat } from '../seat/seat.service.js'

export type PublicBus = {
  id: string
  tourId: string
  name: string
  seatCount: number
  pickupPoints: string[]
}

export type PublicBusLayout = {
  id: string
  name: string
  seatCount: number
  pickupPoints: string[]
  aisleAfterColumn: number | null
  doorRow: number | null
  backRow: number | null
}

/**
 * Pickup points are stored as `{ name, order }` and flattened to the plain
 * name list the contract specifies. Sorting by `order` keeps the modal's
 * dropdown stable regardless of insertion order.
 */
export function pickupPointNames(bus: any): string[] {
  return [...(bus.pickupPoints ?? [])]
    .sort((a: any, b: any) => a.order - b.order)
    .map((p: any) => p.name)
}

/** Resolves a client-facing uuid to the document. Never treat an `id` as an `_id`. */
export async function findBusByUuid(uuid: string): Promise<HydratedDocument<any> | null> {
  return Bus.findOne({ uuid })
}

/**
 * Internal lookup by ObjectId, for following a seat back to its owning bus.
 * Goes through `findOne` (not `findById`) so the soft-delete hook applies — a
 * seat on a soft-deleted bus must read as gone.
 */
export async function findBusById(id: unknown): Promise<HydratedDocument<any> | null> {
  return Bus.findOne({ _id: id as any })
}

/**
 * A tour that does not exist (or is soft-deleted) is a 404 — deliberately
 * distinct from a tour that exists but has no buses yet, which is a 200 with an
 * empty list. The frontend treats the two differently.
 */
export async function listBusesByTourUuid(tourUuid: string): Promise<PublicBus[]> {
  const tour = await tourService.findTourByUuid(tourUuid)
  if (!tour) {
    throw notFound('Tour not found', 'TOUR_NOT_FOUND')
  }

  const buses = await Bus.find({ tourId: tour._id }).sort({ name: 1 }).lean()
  return buses.map((bus: any) => ({
    id: bus.uuid,
    tourId: tourUuid,
    name: bus.name,
    seatCount: bus.seatCount,
    pickupPoints: pickupPointNames(bus),
  }))
}

/**
 * The seat map (F3): layout metadata, pickup points, and every seat's current
 * status in one response, so the modal's pickup list is always as fresh as the
 * statuses shown beside it.
 */
export async function getSeatMap(
  busUuid: string
): Promise<{ bus: PublicBusLayout; seats: PublicSeat[] }> {
  const bus = await findBusByUuid(busUuid)
  if (!bus) {
    throw notFound('Bus not found', 'BUS_NOT_FOUND')
  }

  const seats = await seatService.listSeatsByBus(bus._id, bus.uuid)
  const layout = bus.seatLayout ?? {}

  return {
    bus: {
      id: bus.uuid,
      name: bus.name,
      seatCount: bus.seatCount,
      pickupPoints: pickupPointNames(bus),
      aisleAfterColumn: layout.aisleAfterColumn ?? null,
      doorRow: layout.doorRow ?? null,
      backRow: layout.backRow ?? null,
    },
    seats,
  }
}
