/** Bus domain types (`tour-service`). */

/**
 * A vehicle belonging to a tour. Never `vehicle`/`coach`
 * (.rule/naming-rules.md).
 *
 * `pickupPoints` is an embedded list on the bus (plan 007, Open Question 4) —
 * there is no separate pickup-point collection — and is what populates the
 * seat-request modal's pickup dropdown.
 */
export type Bus = {
  id: string
  tourId: string
  name: string
  seatCount: number
  pickupPoints: string[]
}

/** Response body for `GET /api/tours/:tourId/buses`. */
export type BusesResponse = {
  buses: Bus[]
}
