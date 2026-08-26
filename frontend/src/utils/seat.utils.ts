import { Check, Clock, Lock, User, type LucideIcon } from 'lucide-react'
import type {
  BusSeatLayout,
  Seat,
  SeatRequestFieldErrors,
  SeatRequestFormValues,
  SeatStatus,
} from '../types/seat.types'

/**
 * Seat presentation + client-side validation helpers.
 *
 * `seat` is the one place in this UI where color encodes domain state, so the
 * status→style mapping lives here as a single lookup rather than as inline
 * conditionals scattered across the passenger map and (later) the admin tab
 * (.rule/style-rules.md §Domain-Specific Color Mapping).
 *
 * Per PRD AC-3/AC-17 every status also carries a distinct Lucide icon and a
 * Hebrew text label — color is never the sole signal.
 */

/** Tailwind classes per status, referencing `@theme` tokens (never raw hex). */
export const seatStatusStyles: Record<SeatStatus, string> = {
  available: 'bg-seat-available border-seat-available-border text-seat-available-text',
  pending: 'bg-seat-pending border-seat-pending-border text-seat-pending-text',
  taken: 'bg-seat-taken border-seat-taken-border text-seat-taken-text',
  reserved: 'bg-seat-reserved border-seat-reserved-border text-seat-reserved-text',
}

/** Hebrew label per status — rendered in the legend and every `aria-label`. */
export const seatStatusLabels: Record<SeatStatus, string> = {
  available: 'פנוי',
  pending: 'ממתין לאישור',
  taken: 'תפוס',
  reserved: 'שמור',
}

/**
 * One consistent Lucide icon per status across every view that shows it
 * (.rule/ui-rules.md), substituting the emoji stand-ins in the mockups
 * (docs/design/design-notes.md §Icons).
 */
export const seatStatusIcons: Record<SeatStatus, LucideIcon> = {
  available: Check,
  pending: Clock,
  taken: User,
  reserved: Lock,
}

/** Only an `available` seat can be requested by a passenger (PRD F4). */
export function isSeatRequestable(seat: Seat): boolean {
  return seat.status === 'available'
}

/**
 * Accessible name for a seat: number + status in words, so the status is
 * available to a screen-reader user with no color perception at all.
 */
export function formatSeatAriaLabel(seat: Seat): string {
  const base = `מושב ${seat.label} — ${seatStatusLabels[seat.status]}`
  return isSeatRequestable(seat) ? `${base}. לחצו לשליחת בקשה` : base
}

export function countSeatsByStatus(seats: Seat[], status: SeatStatus): number {
  return seats.filter((seat) => seat.status === status).length
}

/** A laid-out row of the seat map. */
export type SeatRow = {
  row: number
  seats: Seat[]
  /** Draw the aisle gap after this many seats; `0` means no aisle in this row. */
  aisleAfter: number
  /** This row carries the boarding door where its missing seats would be. */
  hasDoor: boolean
  /** Full-width rear bench — visually separated, never split by an aisle. */
  isBackRow: boolean
}

/**
 * Groups a flat seat list into positioned rows.
 *
 * The server is the source of truth for positions; this only sorts and inserts
 * the aisle/door affordances the layout metadata describes. A row that is the
 * bus's `backRow` spans the aisle, so it never gets a gap.
 */
export function buildSeatRows(seats: Seat[], layout: BusSeatLayout): SeatRow[] {
  const byRow = new Map<number, Seat[]>()

  for (const seat of seats) {
    const rowSeats = byRow.get(seat.row)
    if (rowSeats) rowSeats.push(seat)
    else byRow.set(seat.row, [seat])
  }

  const aisleAfterColumn = layout.aisleAfterColumn ?? 0

  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, rowSeats]) => {
      const sorted = [...rowSeats].sort((a, b) => a.column - b.column)
      const isBackRow = layout.backRow != null && layout.backRow === row
      const aisleIndex = sorted.findIndex((seat) => seat.column > aisleAfterColumn)

      return {
        row,
        seats: sorted,
        aisleAfter:
          isBackRow || aisleAfterColumn <= 0 || aisleIndex <= 0 ? 0 : aisleIndex,
        hasDoor: layout.doorRow != null && layout.doorRow === row,
        isBackRow,
      }
    })
}

/**
 * Client-side seat-request validation. Failures render as inline red text under
 * the field, never as a toast (.rule/error-handling-rules.md) — the server
 * re-validates authoritatively.
 */

const MIN_FULL_NAME_LENGTH = 2
/** Israeli local format: 9–10 digits starting with 0, separators ignored. */
const PHONE_DIGITS_PATTERN = /^0\d{8,9}$/

/** Strips spaces, dashes and parentheses so `052-447-1903` validates. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '')
}

export function validateSeatFullName(fullName: string): string | undefined {
  const trimmed = fullName.trim()
  if (!trimmed) return 'יש להזין שם מלא'
  if (trimmed.length < MIN_FULL_NAME_LENGTH) return 'השם המלא קצר מדי'
  return undefined
}

export function validatePhone(phone: string): string | undefined {
  const normalized = normalizePhone(phone)
  if (!normalized) return 'יש להזין מספר טלפון'
  if (!PHONE_DIGITS_PATTERN.test(normalized)) return 'מספר הטלפון אינו תקין'
  return undefined
}

export function validatePickupPoint(pickupPoint: string): string | undefined {
  if (!pickupPoint.trim()) return 'יש לבחור נקודת איסוף'
  return undefined
}

/** Validates the whole form. An empty object means it may be submitted. */
export function validateSeatRequest(values: SeatRequestFormValues): SeatRequestFieldErrors {
  const errors: SeatRequestFieldErrors = {}

  const fullName = validateSeatFullName(values.fullName)
  if (fullName) errors.fullName = fullName

  const phone = validatePhone(values.phone)
  if (phone) errors.phone = phone

  const pickupPoint = validatePickupPoint(values.pickupPoint)
  if (pickupPoint) errors.pickupPoint = pickupPoint

  return errors
}

/** True when any field carries an error, i.e. the form must not be submitted. */
export function hasSeatFieldErrors(errors: SeatRequestFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}
