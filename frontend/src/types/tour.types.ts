/** Tour domain types (`tour-service`). */

/**
 * A scheduled trip. Never `trip`/`event`/`journey` (.rule/naming-rules.md).
 *
 * Only the fields the passenger selector actually needs are modeled here — the
 * admin CRUD ticket (Tab 4b) extends this rather than redefining it.
 * Soft-deleted tours (`deletedAt`) are filtered out server-side and never reach
 * the client, so no delete flag appears on this type.
 */
export type Tour = {
  id: string
  name: string
  /** ISO-8601 date (`YYYY-MM-DD`) the tour departs. */
  startDate: string
  /** ISO-8601 date the tour returns. Same-day tours may omit it. */
  endDate?: string | null
}

/** Response body for `GET /api/tours`. */
export type ToursResponse = {
  tours: Tour[]
}
