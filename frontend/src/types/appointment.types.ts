import type { Service } from './service.types'
import type { TimeSlot } from './timeSlot.types'

// Mirrors the Appointment schema in docs/api-contract/api-contract.booking-service.yaml.
// The client-facing identifier is always `id` (a uuid string) — Mongo's `_id` is
// an internal backend detail and must never appear here (.rule/naming-rules.md).

/**
 * The three states an Appointment can be in. Spelled exactly as the API and the
 * DB spell them (.rule/naming-rules.md) — no alternate casing, no synonyms.
 *
 * `pending`   — created by a Customer, awaiting the Admin's decision.
 * `confirmed` — the Admin approved it.
 * `cancelled` — the Admin cancelled it.
 *
 * Screen 3 only ever creates `pending`: confirming and cancelling belong to the
 * Admin screens (PRD F9-F11), never to the Customer.
 */
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled'

export interface Appointment {
  id: string
  serviceId: string
  timeSlotId: string
  customerName: string
  customerPhone: string
  /** Optional by design (PRD F4) — a Customer without email can still book. */
  customerEmail?: string
  status: AppointmentStatus
}

/**
 * The Service facts a receipt needs. Deliberately a subset of `Service`: a
 * receipt is a record of what was booked, not a live catalogue entry, so
 * `isActive` (which can change afterwards) has no business being here.
 */
export type ReceiptService = Pick<Service, 'name' | 'durationMinutes' | 'price'>

/** The TimeSlot facts a receipt needs — the day and window that was booked. */
export type ReceiptTimeSlot = Pick<TimeSlot, 'date' | 'startTime' | 'endTime'>

/**
 * An Appointment enriched with just enough of its Service and TimeSlot to be
 * read as a receipt (PRD Screen 4: this page is the only receipt the Customer
 * gets). Mirrors the `AppointmentReceipt` schema in
 * docs/api-contract/api-contract.booking-service.yaml.
 *
 * Both nested parts are optional here even though `GET /api/appointments/{id}`
 * always returns them, because the page also assembles this shape client-side
 * from what it already holds right after booking. In that path a fact may
 * genuinely be missing (e.g. the Service list was never loaded), and omitting a
 * row is honest where inventing one would not be.
 */
export interface AppointmentReceipt extends Appointment {
  service?: ReceiptService
  timeSlot?: ReceiptTimeSlot
}

/**
 * One row of the Admin's Appointments list (PRD F9, Screen 7). It is an
 * `Appointment` plus the same two nested display objects a receipt carries —
 * the Admin is reading a list of *bookings*, and "Full groom, Tuesday 09:00" is
 * the only form of that a person can scan; a pair of raw ids is not.
 *
 * Both nested parts are optional for the same reason they are on
 * `AppointmentReceipt`: a Service or TimeSlot that was hard-removed underneath a
 * booking leaves a row that still has to render. Omitting a fact is honest where
 * inventing one would not be.
 *
 * Unlike the public receipt, this shape is only ever fetched through
 * api-gateway behind the Admin JWT — it aggregates customer name and phone
 * across every booking, which is precisely why it has no unauthenticated route.
 */
export interface AdminAppointment extends Appointment {
  service?: ReceiptService
  timeSlot?: ReceiptTimeSlot
}

/**
 * The Admin list filter. Both fields are optional and independent: absent means
 * "do not narrow by this", never "match empty". Sent as query parameters, so an
 * absent field is simply not serialized rather than sent as `''` — an empty
 * string is a value, and a server reading it as one would return nothing.
 */
export interface AppointmentFilter {
  /** A single calendar day, `YYYY-MM-DD`, matched against the slot's date. */
  date?: string
  status?: AppointmentStatus
}

/**
 * The outcome of an Admin confirm/cancel. Modelled as a value rather than an
 * exception for the same reason `CreateAppointmentOutcome` is: a `conflict`
 * (the booking already moved on, in another tab or another session) and a
 * `not-found` (it was removed under the loaded list) are both ordinary results
 * of acting on a list that was fetched a moment ago, and each deserves its own
 * message rather than a generic "try again" that could never succeed.
 */
export type AppointmentActionOutcome = 'updated' | 'conflict' | 'not-found' | 'error'

/**
 * What the Customer types into the form, before validation and trimming. Every
 * field is a plain string — an untouched optional email is `''` here, and only
 * the service decides whether that becomes an omitted wire field.
 */
export interface CustomerDetails {
  customerName: string
  customerPhone: string
  customerEmail: string
}

/**
 * The create-Appointment request body. `slotId` is the source of truth: the
 * server derives the date/time from that TimeSlot document rather than trusting
 * anything else here. `serviceId` is sent for routing/validation only — the
 * server re-checks that the slot really belongs to it instead of taking the
 * client's word for it.
 */
export interface CreateAppointmentPayload {
  slotId: string
  serviceId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
}

/**
 * The outcome of attempting to create an Appointment. As with holding a slot, a
 * conflict is a *normal* result rather than an exception: the hold is
 * short-lived, so a Customer who lingers on the form can legitimately arrive
 * here too late. Modelled as a value the caller must handle, not an error it
 * might forget to catch.
 */
export type CreateAppointmentOutcome = 'created' | 'conflict' | 'error'
