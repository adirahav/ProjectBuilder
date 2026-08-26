import { Tour } from '../api/models/Tour.model.js'
import { Bus } from '../api/models/Bus.model.js'
import { Seat, type SeatStatus } from '../api/models/Seat.model.js'

export async function buildTour(overrides: Record<string, unknown> = {}) {
  return Tour.create({
    name: 'הגליל העליון',
    date: new Date('2026-09-14'),
    endDate: new Date('2026-09-16'),
    ...overrides,
  })
}

export async function buildBus(tourId: unknown, overrides: Record<string, unknown> = {}) {
  return Bus.create({
    tourId: tourId as any,
    name: 'אוטובוס 1',
    seatCount: 4,
    seatLayout: { aisleAfterColumn: 2, doorRow: 3, backRow: 13 },
    pickupPoints: [
      { name: 'צומת גלילות', order: 2 },
      { name: 'תחנה מרכזית תל אביב', order: 1 },
    ],
    ...overrides,
  })
}

export async function buildSeat(
  busId: unknown,
  overrides: { status?: SeatStatus; row?: number; column?: number; label?: string } = {}
) {
  const { status = 'available', row = 1, column = 1, label = '1' } = overrides
  return Seat.create({ busId: busId as any, position: { row, column, label }, status })
}

/** A full, valid booking body — spread over it to make a single field invalid. */
export const validPassenger = {
  fullName: 'דנה לוי',
  phone: '0524471903',
  pickupPoint: 'צומת גלילות',
}
