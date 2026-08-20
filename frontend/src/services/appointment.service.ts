import axios from 'axios'

// Namespace import on purpose, matching service.service.ts: this module now
// reaches for two different clients, and reading a named binding at module
// scope would make it fail to load the moment a test partially mocks
// http.service. Every access below happens inside a function.
import * as http from './http.service'
import { normalizeCustomerDetails, validateCustomerDetails } from '../utils/customer.utils'
import { isAppointmentStatus } from '../utils/appointmentStatus.utils'
import { isDateKey } from '../utils/date.utils'
import type {
  AdminAppointment,
  Appointment,
  AppointmentFilter,
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

  return http.httpService.post<Appointment>(BASE_URL, toCreatePayload(serviceId, slotId, details))
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

  return http.httpService.get<AppointmentReceipt>(
    `${BASE_URL}/${encodeURIComponent(appointmentId)}`,
  )
}

/**
 * Builds the query object for the Admin list, dropping anything that would only
 * narrow the result set by accident.
 *
 * A malformed date or an unrecognized status is *omitted* rather than sent: the
 * filter is a way of looking at the list, so the worst honest outcome is a
 * wider list than asked for. Forwarding a value the server cannot parse would
 * trade that for a 400 and an empty screen.
 */
export function toAdminListParams(filter: AppointmentFilter = {}): Record<string, string> {
  const params: Record<string, string> = {}

  if (filter.date && isDateKey(filter.date)) params.date = filter.date
  if (filter.status && isAppointmentStatus(filter.status)) params.status = filter.status

  return params
}

/**
 * The Admin's list of every Appointment (PRD F9), narrowed by an optional day
 * and status. Goes through api-gateway, never booking-service directly: the
 * response aggregates customer name and phone across every booking in the
 * clinic, so the JWT-verifying origin is the only one that may serve it.
 *
 * A non-array body is treated as an empty list rather than being handed to the
 * page to crash on — a backend that answers with an error envelope where a list
 * was promised is a fault worth logging, not worth rendering.
 */
async function getAdminList(filter: AppointmentFilter = {}): Promise<AdminAppointment[]> {
  const appointments = await http.gatewayHttpService.get<AdminAppointment[]>(
    BASE_URL,
    toAdminListParams(filter),
  )

  if (!Array.isArray(appointments)) {
    console.log('[APPOINTMENT] unexpected admin appointments payload shape')
    return []
  }

  return appointments
}

/**
 * Confirms a pending Appointment (PRD F10). The server applies the transition
 * conditionally on the current status, so a booking that moved on in another
 * tab answers 409 rather than being silently re-confirmed — only the response
 * proves what happened (.rule/error-handling-rules.md).
 */
async function confirm(appointmentId: string): Promise<AdminAppointment> {
  if (!appointmentId) {
    console.log('[APPOINTMENT] refusing to confirm without an appointment id')
    throw new Error('Missing appointmentId')
  }

  return http.gatewayHttpService.patch<AdminAppointment>(
    `${BASE_URL}/${encodeURIComponent(appointmentId)}/confirm`,
  )
}

/**
 * Cancels a pending or confirmed Appointment (PRD F11) and, server-side,
 * releases the TimeSlot behind it back to `open` so the time returns to the
 * public picker.
 *
 * That second write is deliberately the server's job and not two calls from
 * here: a client that cancelled the booking and then failed to release the slot
 * would strand a time nobody can ever book (plan 013, Open Question 3).
 */
async function cancel(appointmentId: string): Promise<AdminAppointment> {
  if (!appointmentId) {
    console.log('[APPOINTMENT] refusing to cancel without an appointment id')
    throw new Error('Missing appointmentId')
  }

  return http.gatewayHttpService.patch<AdminAppointment>(
    `${BASE_URL}/${encodeURIComponent(appointmentId)}/cancel`,
  )
}

export const appointmentService = {
  create,
  getReceipt,
  getAdminList,
  confirm,
  cancel,
}
