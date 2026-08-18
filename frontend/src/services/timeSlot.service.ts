import axios from 'axios'

import { httpService } from './http.service'
import { isDateKey } from '../utils/date.utils'
import type { TimeSlot } from '../types/timeSlot.types'

// Endpoints mirror docs/api-contract/api-contract.booking-service.yaml.
const BASE_URL = '/api/time-slots'

/** HTTP status booking-service returns when a slot is no longer `open`. */
export const CONFLICT_STATUS = 409

/**
 * True for the one error the booking flow treats as an expected outcome rather
 * than a failure: someone else claimed the slot first (PRD AC-2). Kept here, in
 * the service that owns the endpoint, so no page has to know that "taken" means
 * HTTP 409 (.rule/error-handling-rules.md).
 */
export function isSlotConflictError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === CONFLICT_STATUS
}

/**
 * Public, unauthenticated (PRD F2). booking-service returns only slots whose
 * effective status is `open` for that Service and day — including slots whose
 * hold has lazily expired (F3b). The defensive filter below only guards against
 * a backend that starts returning `held`/`booked` records, so a slot the
 * Customer cannot actually take never renders as available.
 */
async function getList(serviceId: string, date: string): Promise<TimeSlot[]> {
  if (!serviceId || !isDateKey(date)) {
    // A malformed query is a bug on our side, not a server error — refuse to
    // send it rather than letting the backend answer something meaningless.
    console.log('[TIMESLOT] refusing to request slots for an invalid service/date')
    return []
  }

  const slots = await httpService.get<TimeSlot[]>(BASE_URL, { serviceId, date })

  if (!Array.isArray(slots)) {
    console.log('[TIMESLOT] unexpected time slots payload shape')
    return []
  }

  return slots.filter((slot) => slot.status === 'open')
}

/**
 * Public, unauthenticated (PRD F3). Asks booking-service to atomically move the
 * slot `open` → `held`. Exclusivity is enforced by the datastore itself, so the
 * only trustworthy answer is this response: never assume the hold succeeded.
 * Rejects with a 409 AxiosError when another Customer got there first.
 */
async function hold(slotId: string): Promise<TimeSlot> {
  return httpService.post<TimeSlot>(`${BASE_URL}/${slotId}/hold`)
}

export const timeSlotService = {
  getList,
  hold,
}
