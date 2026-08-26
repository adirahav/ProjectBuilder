/** Seat domain types (`tour-service`). */

/**
 * The four — and only four — seat statuses (PRD, .rule/naming-rules.md).
 * No alternate casing, no synonyms, identical values in UI, API, and DB.
 */
export type SeatStatus = 'available' | 'pending' | 'taken' | 'reserved'

/**
 * A single seat position on a bus.
 *
 * Passenger identity (name/phone/pickupPoint) is deliberately NOT part of this
 * type: the passenger seat map is a public, unauthenticated surface, so the
 * server must never send other passengers' PII to it. The admin seat-management
 * ticket consumes an authenticated, richer shape of its own.
 */
export type Seat = {
  id: string
  busId: string
  /** Human-facing seat number, e.g. `"17"`. Rendered LTR-isolated. */
  label: string
  /** 1-based grid position used to lay the map out. */
  row: number
  column: number
  status: SeatStatus
}

/**
 * The bus-level layout metadata that comes back alongside the seats, so the map
 * can be drawn without a second request and the modal's pickup list is always
 * as fresh as the statuses it is shown next to.
 */
export type BusSeatLayout = {
  id: string
  name: string
  seatCount: number
  pickupPoints: string[]
  /** Aisle is drawn after this column. `null` means a single block of seats. */
  aisleAfterColumn?: number | null
  /** Row containing the boarding door (the door replaces the missing seats). */
  doorRow?: number | null
  /** Full-width rear bench row — spans the aisle, so no aisle gap is drawn. */
  backRow?: number | null
}

/** Response body for `GET /api/buses/:busId/seats` (F3). */
export type SeatMap = {
  bus: BusSeatLayout
  seats: Seat[]
}

/** Request body for `POST /api/seats/bookings` — the `request` action (F4). */
export type SeatRequestPayload = {
  seatId: string
  fullName: string
  phone: string
  pickupPoint: string
}

/** Response body for a successful `POST /api/seats/bookings` (201). */
export type SeatRequestResponse = {
  /** The seat as the server now holds it — `status: "pending"`. */
  seat: Seat
}

/** The seat-request modal's editable fields. */
export type SeatRequestFormValues = Omit<SeatRequestPayload, 'seatId'>

/** Per-field client-side validation errors for the seat-request form. */
export type SeatRequestFieldErrors = Partial<Record<keyof SeatRequestFormValues, string>>
