import axios from 'axios'

import { httpService } from './http.service'
import { normalizeCustomerDetails, validateCustomerDetails } from '../utils/customer.utils'
import type {
  Appointment,
  AppointmentReceipt,
  CreateAppointmentPayload,
  CustomerDetails,
} from '../types/appointment.types'

// Endpoints mirror docs/api-contract/api-contract.booking-service.yaml.
const BASE_URL = '/api/appointments'

/**
 * HTTP status booking-service returns when the TimeSlot behind the Appointment
 * is no longer `held` by this Customer — the hold lapsed, or someone else has
 * already booked it.
 */
export const CONFLICT_STATUS = 409

/** HTTP status booking-service returns when no Appointment has the given id. */
export const NOT_FOUND_STATUS = 404

/**
 * True for the one error the booking flow treats as an expected outcome rather
 * than a failure: the hold is gone by the time the Customer submits (PRD F3b —
 * holds are short-lived). Kept here, in the service that owns the endpoint, so
 * no page has to know that "your time lapsed" means HTTP 409
 * (.rule/error-handling-rules.md).
 */
export function isAppointmentConflictError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === CONFLICT_STATUS
}

/**
 * True for the 404 that means "no Appointment with that id" — a stale link, a
 * mistyped URL, or a booking that no longer exists. Distinct from a network or
 * server failure: nothing is wrong and retrying will not help, so the page says
 * "we could not find that booking" instead of offering a retry.
 */
export function isAppointmentNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === NOT_FOUND_STATUS
}

/**
 * Builds the wire payload from what the Customer typed. Trimming happens here
 * rather than in the component so that what is validated and what is sent can
 * never drift apart, and an email left blank is *omitted* rather than sent as
 * `''` — the field is optional in the contract, and an empty string is a value,
 * not an absence.
 */
export function toCreatePayload(
  serviceId: string,
  slotId: string,
  details: CustomerDetails,
): CreateAppointmentPayload {
  const { customerName, customerPhone, customerEmail } = normalizeCustomerDetails(details)

  return {
    slotId,
    serviceId,
    customerName,
    customerPhone,
    ...(customerEmail ? { customerEmail } : {}),
  }
}

/**
 * Public, unauthenticated (PRD F4). Asks booking-service to create the
 * Appointment and finalize the held TimeSlot `held` → `booked` in one atomic
 * step. As with the hold, only the response is trusted: this rejects with a 409
 * AxiosError when the hold has lapsed or the slot was booked in the meantime.
 *
 * Validation runs again here even though the form already ran it — a malformed
 * request is a bug on our side, and refusing to send it is cheaper and clearer
 * than letting the backend answer 400 (.rule/error-handling-rules.md, "fail
 * fast on invalid input").
 */
async function create(
  serviceId: string,
  slotId: string,
  details: CustomerDetails,
): Promise<Appointment> {
  if (!serviceId || !slotId) {
    console.log('[APPOINTMENT] refusing to book without a service and a held slot')
    throw new Error('Missing serviceId or slotId')
  }

  if (Object.keys(validateCustomerDetails(details)).length > 0) {
    console.log('[APPOINTMENT] refusing to send invalid customer details')
    throw new Error('Invalid customer details')
  }

  return httpService.post<Appointment>(BASE_URL, toCreatePayload(serviceId, slotId, details))
}

/**
 * Public, unauthenticated (PRD Screen 4). Re-reads one Appointment as a
 * receipt, enriched server-side with the Service and TimeSlot facts the
 * confirmation page shows.
 *
 * This exists for one case only: the Customer reloads, bookmarks or reopens the
 * confirmation URL, so the in-memory booking is gone. The happy path never
 * calls it — the Appointment is already in hand at that point, and spending a
 * round-trip to re-learn what we just created would be waste.
 *
 * A 404 here is an ordinary outcome (a stale or mistyped id), not a fault; the
 * error is left to propagate so the caller can render the "we could not find
 * that booking" state rather than a failure (.rule/error-handling-rules.md).
 */
async function getReceipt(appointmentId: string): Promise<AppointmentReceipt> {
  if (!appointmentId) {
    console.log('[APPOINTMENT] refusing to fetch a receipt without an appointment id')
    throw new Error('Missing appointmentId')
  }

  return httpService.get<AppointmentReceipt>(`${BASE_URL}/${encodeURIComponent(appointmentId)}`)
}

export const appointmentService = {
  create,
  getReceipt,
}
