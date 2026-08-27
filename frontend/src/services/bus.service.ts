import type { Bus, BusesResponse } from '../types/bus.types'
import { useStore } from '../store/store'
import { httpService } from './http.service'

/**
 * Bus domain service (`tour-service`).
 *
 * All requests go through `http.service.ts` — never `fetch` directly, and never
 * from a component. Errors propagate to the calling page/hook, which maps them
 * to hardcoded Hebrew copy (.rule/error-handling-rules.md).
 */

const SERVICE = 'tour-service' as const

/**
 * Lists the buses belonging to one tour (plan 007, Step 2).
 *
 * `withAuth: false` for the same reason as `tourService.getTours` — the
 * Passenger View is unauthenticated by design.
 */
async function getBusesByTour(tourId: string, signal?: AbortSignal): Promise<Bus[]> {
  const res = await httpService.get<BusesResponse>(
    `/api/tours/${encodeURIComponent(tourId)}/buses`,
    { service: SERVICE, withAuth: false, signal },
  )

  // The service updates the store directly; the component must not repeat this.
  useStore.getState().setBuses(res.buses)
  console.log('[BUS] loaded buses for tour', res.buses.length)

  return res.buses
}

/**
 * Lists one tour's buses **without** touching the store (plan 009, Step 7).
 *
 * The admin "Tours & Buses" tab shows several tours expanded side by side, so it
 * holds more than one bus list at a time — a shape the single `buses` slice
 * cannot represent. Writing through `getBusesByTour` there would also clobber
 * the tour/bus selection the Seat Management and Manifest tabs are built on.
 *
 * This is not an exception to "services update the store directly": that rule
 * governs which layer owns a store write, and here there is no shared state to
 * own. The caller renders the returned list from its own local state.
 */
async function listBusesForTour(tourId: string, signal?: AbortSignal): Promise<Bus[]> {
  const res = await httpService.get<BusesResponse>(
    `/api/tours/${encodeURIComponent(tourId)}/buses`,
    { service: SERVICE, withAuth: false, signal },
  )

  console.log('[BUS] listed buses for tour', tourId, res.buses.length)

  return res.buses
}

export const busService = {
  getBusesByTour,
  listBusesForTour,
}
