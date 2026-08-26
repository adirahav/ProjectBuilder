import type { Tour, ToursResponse } from '../types/tour.types'
import { useStore } from '../store/store'
import { httpService } from './http.service'

/**
 * Tour domain service (`tour-service`).
 *
 * All requests go through `http.service.ts` — never `fetch` directly, and never
 * from a component. Errors propagate to the calling page/hook, which maps them
 * to hardcoded Hebrew copy (.rule/error-handling-rules.md).
 */

const SERVICE = 'tour-service' as const

/**
 * Lists the tours a passenger can pick from (plan 007, Step 2).
 *
 * `withAuth: false`: the Passenger View is an unauthenticated surface (PRD
 * Screen 1 — "no auth step"), so this must not attach a lingering admin JWT.
 * That also keeps a stale/expired admin token from triggering the global 401
 * session-expiry redirect and bouncing a passenger off the page.
 */
async function getTours(signal?: AbortSignal): Promise<Tour[]> {
  const res = await httpService.get<ToursResponse>('/api/tours', {
    service: SERVICE,
    withAuth: false,
    signal,
  })

  // The service updates the store directly; the component must not repeat this.
  useStore.getState().setTours(res.tours)
  console.log('[TOUR] loaded tours', res.tours.length)

  return res.tours
}

export const tourService = {
  getTours,
}
