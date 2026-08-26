import type { SeatMap, SeatRequestPayload, SeatRequestResponse } from '../types/seat.types'
import { useStore } from '../store/store'
import { httpService } from './http.service'
import { normalizePhone } from '../utils/seat.utils'

/**
 * Seat domain service (`tour-service`).
 *
 * All requests go through `http.service.ts` — never `fetch` directly, and never
 * from a component. Errors propagate to the calling page/hook, which maps them
 * to hardcoded Hebrew copy (.rule/error-handling-rules.md).
 *
 * PII: a seat request carries the passenger's full name and phone number. Those
 * values are sent once in the request body and are never logged here — the log
 * lines below deliberately reference only ids and counts (plan 007 §Risks).
 */

const SERVICE = 'tour-service' as const

/**
 * Fetches the current seat map for a bus (F3, `GET /api/buses/:busId/seats`).
 *
 * The response is only written to the store while `busId` is still the selected
 * bus: a slow response for a bus the passenger has already switched away from
 * would otherwise land as the map for the new bus.
 */
async function getSeatMap(busId: string, signal?: AbortSignal): Promise<SeatMap> {
  const seatMap = await httpService.get<SeatMap>(
    `/api/buses/${encodeURIComponent(busId)}/seats`,
    { service: SERVICE, withAuth: false, signal },
  )

  const { selectedBusId, setSeatMap } = useStore.getState()
  if (selectedBusId === busId) {
    // The service updates the store directly; the component must not repeat this.
    setSeatMap(seatMap)
  }
  console.log('[SEAT] loaded seat map', busId, seatMap.seats.length)

  return seatMap
}

/**
 * Requests an `available` seat — the `request` action (F4,
 * `POST /api/seats/bookings`).
 *
 * The server arbitrates concurrent requests atomically and is the sole source
 * of truth (PRD NFR / F5): this never marks the seat `pending` optimistically.
 * It writes back only the seat the server confirmed, and a lost race surfaces
 * as the `ConflictError` (409) that `http.service.ts` classifies — which the
 * caller must handle distinctly and follow with a seat-map refresh
 * (.rule/error-handling-rules.md).
 */
async function requestSeat(payload: SeatRequestPayload): Promise<SeatRequestResponse> {
  const body: SeatRequestPayload = {
    seatId: payload.seatId,
    fullName: payload.fullName.trim(),
    phone: normalizePhone(payload.phone),
    pickupPoint: payload.pickupPoint,
  }

  const res = await httpService.post<SeatRequestResponse>('/api/seats/bookings', body, {
    service: SERVICE,
    withAuth: false,
  })

  // The service updates the store directly; the component must not repeat this.
  useStore.getState().applySeat(res.seat)
  console.log('[SEAT] request accepted for seat', res.seat.id, res.seat.status)

  return res
}

export const seatService = {
  getSeatMap,
  requestSeat,
}
