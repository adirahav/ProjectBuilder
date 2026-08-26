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

export const busService = {
  getBusesByTour,
}
