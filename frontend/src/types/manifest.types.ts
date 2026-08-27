import type { SeatStatus } from './seat.types'

/**
 * Passenger manifest types (`tour-service`, Screen 4c / F15).
 *
 * This is the **only** shape in the frontend that carries passenger PII
 * (`fullName`, `phone`, `pickupPoint`). It comes from the admin-authenticated
 * `GET /api/buses/:busId/manifest`, deliberately distinct from the public
 * `GET /api/buses/:busId/seats`, whose `Seat` type must stay PII-free (plan 008
 * audit / plan 009 §Risks). Never widen `Seat` with these fields.
 */

/** One row of the manifest — a seat plus, when occupied, who occupies it. */
export type ManifestRow = {
  /** The seat's client-facing id. Rows are keyed by it. */
  seatId: string
  /** Human-facing seat number, e.g. `"17"`. Rendered LTR-isolated. */
  seatLabel: string
  status: SeatStatus
  /**
   * PII. Absent/`null` for a seat nobody has claimed (`available`), and for a
   * `reserved` seat blocked by the admin rather than assigned to a passenger.
   */
  fullName?: string | null
  phone?: string | null
  pickupPoint?: string | null
}

/** Bus identification returned alongside the rows, for the report header. */
export type ManifestBus = {
  id: string
  name: string
  seatCount: number
}

/** Response body for `GET /api/buses/:busId/manifest` (F15). */
export type Manifest = {
  bus: ManifestBus
  rows: ManifestRow[]
}

/** Status filter in the manifest toolbar. `all` means "do not filter". */
export type ManifestStatusFilter = SeatStatus | 'all'

/** The manifest toolbar's client-side filter state. */
export type ManifestFilters = {
  status: ManifestStatusFilter
  /** Free-text query matched against name, phone, and pickup point. */
  query: string
}
