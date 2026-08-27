import { describe, expect, it } from 'vitest'
import type { BusSeatLayout, Seat, SeatStatus } from '../types/seat.types'
import {
  buildSeatRows,
  countSeatsByStatus,
  formatSeatAriaLabel,
  hasSeatFieldErrors,
  isSeatRequestable,
  normalizePhone,
  seatStatusIcons,
  seatStatusLabels,
  seatStatusStyles,
  validatePhone,
  validatePickupPoint,
  validateSeatFullName,
  validateSeatRequest,
} from './seat.utils'

/** Seat presentation + seat-request validation. */

const ALL_STATUSES: SeatStatus[] = ['available', 'pending', 'taken', 'reserved']

function buildSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: 's1',
    busId: 'b1',
    label: '1',
    row: 1,
    column: 1,
    status: 'available',
    ...overrides,
  }
}

const LAYOUT: BusSeatLayout = {
  id: 'b1',
  name: 'אוטובוס 1',
  seatCount: 9,
  pickupPoints: ['תל אביב'],
  aisleAfterColumn: 2,
  doorRow: 2,
  backRow: 3,
}

describe('seat status presentation', () => {
  it('defines a style, a label and an icon for every one of the four statuses', () => {
    for (const status of ALL_STATUSES) {
      expect(seatStatusStyles[status]).toBeTruthy()
      expect(seatStatusLabels[status]).toBeTruthy()
      expect(seatStatusIcons[status]).toBeTruthy()
    }
  })

  it('gives each status a distinct icon, so colour is never the only signal', () => {
    const icons = new Set(ALL_STATUSES.map((status) => seatStatusIcons[status]))

    expect(icons.size).toBe(ALL_STATUSES.length)
  })

  it('spells the status out inside the accessible name', () => {
    expect(formatSeatAriaLabel(buildSeat({ label: '7', status: 'taken' }))).toBe('מושב 7 — תפוס')
  })

  it('tells the passenger an available seat is actionable', () => {
    expect(formatSeatAriaLabel(buildSeat({ label: '7' }))).toBe(
      'מושב 7 — פנוי. לחצו לשליחת בקשה',
    )
  })

  it('drops the call to action in a read-only map', () => {
    expect(formatSeatAriaLabel(buildSeat({ label: '7' }), false)).toBe('מושב 7 — פנוי')
  })

  it('treats only an available seat as requestable', () => {
    expect(isSeatRequestable(buildSeat({ status: 'available' }))).toBe(true)
    for (const status of ['pending', 'taken', 'reserved'] as SeatStatus[]) {
      expect(isSeatRequestable(buildSeat({ status }))).toBe(false)
    }
  })

  it('counts seats by status', () => {
    const seats = [
      buildSeat({ id: 'a', status: 'available' }),
      buildSeat({ id: 'b', status: 'available' }),
      buildSeat({ id: 'c', status: 'taken' }),
    ]

    expect(countSeatsByStatus(seats, 'available')).toBe(2)
    expect(countSeatsByStatus(seats, 'reserved')).toBe(0)
  })
})

describe('buildSeatRows', () => {
  const seats = [
    buildSeat({ id: 's4', label: '4', row: 1, column: 4 }),
    buildSeat({ id: 's1', label: '1', row: 1, column: 1 }),
    buildSeat({ id: 's3', label: '3', row: 1, column: 3 }),
    buildSeat({ id: 's2', label: '2', row: 1, column: 2 }),
    buildSeat({ id: 's5', label: '5', row: 2, column: 1 }),
    buildSeat({ id: 's6', label: '6', row: 2, column: 2 }),
    buildSeat({ id: 's7', label: '7', row: 3, column: 1 }),
    buildSeat({ id: 's8', label: '8', row: 3, column: 2 }),
    buildSeat({ id: 's9', label: '9', row: 3, column: 3 }),
  ]

  it('orders rows and the seats within each row by position', () => {
    const rows = buildSeatRows(seats, LAYOUT)

    expect(rows.map((row) => row.row)).toEqual([1, 2, 3])
    expect(rows[0].seats.map((seat) => seat.label)).toEqual(['1', '2', '3', '4'])
  })

  it('places the aisle after the column the bus layout specifies', () => {
    const rows = buildSeatRows(seats, LAYOUT)

    expect(rows[0].aisleAfter).toBe(2)
  })

  it('omits the aisle in a row that has no seats past it', () => {
    const rows = buildSeatRows(seats, LAYOUT)

    expect(rows[1].aisleAfter).toBe(0)
  })

  it('never splits the full-width back row with an aisle', () => {
    const rows = buildSeatRows(seats, LAYOUT)

    expect(rows[2].isBackRow).toBe(true)
    expect(rows[2].aisleAfter).toBe(0)
  })

  it('marks the row carrying the boarding door', () => {
    const rows = buildSeatRows(seats, LAYOUT)

    expect(rows.filter((row) => row.hasDoor).map((row) => row.row)).toEqual([2])
  })

  it('draws a single block of seats when the bus has no aisle', () => {
    const rows = buildSeatRows(seats, { ...LAYOUT, aisleAfterColumn: null })

    expect(rows.every((row) => row.aisleAfter === 0)).toBe(true)
  })
})

describe('seat-request validation', () => {
  it('requires a full name', () => {
    expect(validateSeatFullName('  ')).toBe('יש להזין שם מלא')
  })

  it('rejects a one-character name', () => {
    expect(validateSeatFullName('נ')).toBe('השם המלא קצר מדי')
  })

  it('accepts a real name', () => {
    expect(validateSeatFullName('נועה לוי')).toBeUndefined()
  })

  it('requires a phone number', () => {
    expect(validatePhone('')).toBe('יש להזין מספר טלפון')
  })

  it.each(['052-447-1903', '052 447 1903', '0524471903', '036221234'])(
    'accepts %s regardless of separators',
    (phone) => {
      expect(validatePhone(phone)).toBeUndefined()
    },
  )

  it.each(['123', '9524471903', '05244719031', 'לא-מספר'])('rejects %s', (phone) => {
    expect(validatePhone(phone)).toBe('מספר הטלפון אינו תקין')
  })

  it('strips separators when normalising a phone number', () => {
    expect(normalizePhone('(052) 447-1903')).toBe('0524471903')
  })

  it('requires a pickup point', () => {
    expect(validatePickupPoint('')).toBe('יש לבחור נקודת איסוף')
    expect(validatePickupPoint('חיפה — חוף הכרמל')).toBeUndefined()
  })

  it('reports every invalid field at once', () => {
    const errors = validateSeatRequest({ fullName: '', phone: '123', pickupPoint: '' })

    expect(Object.keys(errors).sort()).toEqual(['fullName', 'phone', 'pickupPoint'])
    expect(hasSeatFieldErrors(errors)).toBe(true)
  })

  it('passes a fully valid form', () => {
    const errors = validateSeatRequest({
      fullName: 'נועה לוי',
      phone: '052-4471903',
      pickupPoint: 'חיפה — חוף הכרמל',
    })

    expect(hasSeatFieldErrors(errors)).toBe(false)
  })
})
