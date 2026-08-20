import { Appointment } from '../models/appointment.model.ts'
import { TimeSlot } from '../models/time-slot.model.ts'
import { sendAppointmentConfirmation } from '../lib/notification-client.ts'
import { holdExpiryCutoff, releaseTimeSlot } from '../time-slot/time-slot.service.ts'
import type { AppointmentStatus } from '../models/appointment.model.ts'

// Exactly the fields the contract's Appointment schema allows
// (additionalProperties: false) — nothing else is ever serialized. This record
// holds PII, so the projection is explicit rather than "whatever the doc has".
export interface PublicAppointment {
  id: string
  serviceId: string
  timeSlotId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  status: 'pending' | 'confirmed' | 'cancelled'
}

/**
 * Exactly the fields the contract's AppointmentReceipt schema allows
 * (additionalProperties: false): the Appointment plus flat, denormalized
 * snapshots of the Service and TimeSlot facts Screen 4 has to state.
 *
 * `isActive` is deliberately absent from `service` — whether the clinic still
 * offers the treatment says nothing about an appointment already made — and
 * `status`/`holdExpiresAt`/`heldAt` are absent from `timeSlot`, which is
 * necessarily `booked` and whose hold bookkeeping is server-side only.
 */
export interface AppointmentReceipt extends PublicAppointment {
  service: { name: string; durationMinutes: number; price: number }
  timeSlot: { date: string; startTime: string; endTime: string }
}

/** Already validated by the controller — no raw request shape reaches here. */
export interface CreateAppointmentInput {
  slotId: string
  serviceId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
}

export type CreateAppointmentResult =
  | { outcome: 'created'; appointment: PublicAppointment }
  | { outcome: 'not-found' }
  | { outcome: 'service-mismatch' }
  | { outcome: 'conflict' }

/**
 * Book a held TimeSlot into an Appointment (PRD F4) — the second half of the
 * hold->book lifecycle whose first half is `holdTimeSlot`.
 *
 * The ordering below is the contract's, and it is load-bearing:
 *
 * 1. Resolve the slot and cross-check the client's `serviceId` against the
 *    slot's own. The slot document is authoritative — the body's serviceId is
 *    a mismatch check only, so a client can never book one Service's slot under
 *    another's name. Note this read is NOT the concurrency precondition; it
 *    only distinguishes 404/400 from the outcomes below.
 * 2. Transition `held` -> `booked` with a SINGLE atomic conditional update. The
 *    precondition (`status: 'held'` AND a non-lapsed `heldAt`) lives inside the
 *    filter, so MongoDB's per-document atomicity — not application code —
 *    decides who wins. A read-then-write here would let a double-tap create two
 *    Appointments for one slot (`seat-concurrency-layer`).
 * 3. Only then create the Appointment. Winning the transition is what earns the
 *    right to a record, so no partial booking can exist for a slot we lost.
 * 4. Fire the confirmation notification best-effort, never blocking on it.
 *
 * A lapsed hold counts as `open` (PRD F3b) and is deliberately NOT bookable:
 * that slot belongs to everyone again. The `heldAt` clause in the filter is what
 * enforces that, and it is why a stale hold yields 409 rather than a booking.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const existing = await TimeSlot.findOne({ uuid: input.slotId })
    // `name` is pulled only for the notification payload; it is never part of
    // the Appointment response, whose shape the contract fixes exactly.
    .populate<{ serviceId: { _id: unknown; uuid: string; name: string } }>('serviceId', 'uuid name')
    .lean()

  if (!existing) return { outcome: 'not-found' }
  if (existing.serviceId?.uuid !== input.serviceId) return { outcome: 'service-mismatch' }

  const booked = await TimeSlot.findOneAndUpdate(
    {
      uuid: input.slotId,
      status: 'held',
      // A hold that has lapsed past the TTL is effectively open, and must not
      // be finalizable. This clause is the server-side expiry check the
      // client's advisory countdown can never be trusted to perform.
      heldAt: { $gte: holdExpiryCutoff() },
    },
    { $set: { status: 'booked' } },
    { new: true },
  ).lean()

  // The conditional update matched nothing: the hold lapsed, the slot was never
  // held, or another request booked it first. Expected under normal use — holds
  // are short-lived by design — and no Appointment was created.
  if (!booked) return { outcome: 'conflict' }

  const created = await Appointment.create({
    // Derived from the slot document, never copied from the request body.
    serviceId: existing.serviceId._id,
    timeSlotId: booked._id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    // Absent, not an empty string, when the Customer left it blank.
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    // status is not read from input — this endpoint always creates `pending`.
  })

  const appointment: PublicAppointment = {
    id: created.uuid,
    serviceId: existing.serviceId.uuid,
    timeSlotId: booked.uuid,
    customerName: created.customerName,
    customerPhone: created.customerPhone,
    ...(created.customerEmail ? { customerEmail: created.customerEmail } : {}),
    status: 'pending',
  }

  // Best effort, deliberately un-awaited (PRD F4b): the Customer's booking is
  // already committed, so the response must not wait on — or be failed by —
  // notification-service. `sendAppointmentConfirmation` never rejects, so this
  // floating promise cannot become an unhandled rejection.
  void sendAppointmentConfirmation({
    appointmentId: appointment.id,
    serviceName: existing.serviceId.name,
    date: booked.date,
    startTime: booked.startTime,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    ...(appointment.customerEmail ? { customerEmail: appointment.customerEmail } : {}),
  })

  return { outcome: 'created', appointment }
}

/**
 * Read one Appointment back as a Customer receipt (PRD Screen 4).
 *
 * STRICTLY READ-ONLY. This must not mutate the Appointment, and must not touch
 * the TimeSlot behind it — in particular it must never trip any hold-expiry
 * healing, because a booked slot has no live hold and a receipt is a record of
 * what happened, not a step in the lifecycle.
 *
 * The Service and TimeSlot facts are resolved from the referenced documents
 * server-side; they are never accepted from a client. The projection below is
 * explicit rather than "whatever the docs have" — this response goes to an
 * unauthenticated caller and the Appointment carries PII, so nothing leaks by
 * omission: no internal notes, no audit fields, and nothing about the Service
 * beyond the three fields the contract names.
 *
 * Returns `null` for both "no such uuid" and "the referenced documents no
 * longer resolve"; the controller answers 404 either way, with the same generic
 * body it uses for a malformed id, so the response cannot be used to
 * distinguish "exists" from "does not" while enumerating ids.
 */
export async function getAppointmentReceipt(id: string): Promise<AppointmentReceipt | null> {
  // `findOne` (not `findOneAndUpdate`) — read-only by construction. The model's
  // pre('findOne') hook adds `deletedAt: null`, so a soft-deleted Appointment is
  // indistinguishable from a non-existent one, which is what we want here.
  const appointment = await Appointment.findOne({ uuid: id })
    .populate<{ serviceId: { uuid: string; name: string; durationMinutes: number; price: number } }>(
      'serviceId',
      'uuid name durationMinutes price',
    )
    .populate<{
      timeSlotId: { uuid: string; date: string; startTime: string; endTime: string }
    }>('timeSlotId', 'uuid date startTime endTime')
    .lean()

  if (!appointment) return null

  const service = appointment.serviceId
  const timeSlot = appointment.timeSlotId
  // A dangling ref means the data is inconsistent, not that the caller asked
  // wrongly — but a half-built receipt would violate the contract's required
  // fields, so it is treated as "not found" rather than serialized incomplete.
  if (!service || !timeSlot) return null

  return toEnrichedAppointment(appointment, service, timeSlot)
}

/**
 * Maps an Appointment plus its populated Service and TimeSlot to exactly the
 * fields the contract's AppointmentReceipt schema allows
 * (additionalProperties: false).
 *
 * Explicit rather than spread-from-the-document because `.lean()` bypasses the
 * model's toJSON transform: nothing may leak by omission here — no `_id`, no
 * `__v`, no `createdAt`/`deletedAt`, no `heldAt`, no `isActive`.
 */
function toEnrichedAppointment(
  appointment: {
    uuid: string
    customerName: string
    customerPhone: string
    customerEmail?: string | null
    status: AppointmentStatus
  },
  service: { uuid: string; name: string; durationMinutes: number; price: number },
  timeSlot: { uuid: string; date: string; startTime: string; endTime: string },
): AppointmentReceipt {
  return {
    id: appointment.uuid,
    serviceId: service.uuid,
    timeSlotId: timeSlot.uuid,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    // Absent, not an empty string, when the Customer left it blank.
    ...(appointment.customerEmail ? { customerEmail: appointment.customerEmail } : {}),
    status: appointment.status,
    service: {
      name: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
    },
    timeSlot: {
      date: timeSlot.date,
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
    },
  }
}

// ---------------------------------------------------------------------------
// Admin Appointment management (PRD F9-F11).
//
// These carry no auth check in this service: api-gateway verifies the Admin JWT
// and only then forwards, exactly the trust boundary the Admin Service writes
// (F6-F8) already use. This port must not be publicly exposed.
// ---------------------------------------------------------------------------

/** Already validated by the controller — no raw query object reaches here. */
export interface ListAppointmentsFilter {
  /** A plain YYYY-MM-DD calendar day, matched against the TimeSlot's own `date`. */
  date?: string
  status?: AppointmentStatus
}

/**
 * Every Appointment, for the Admin list (PRD F9), enriched with the Service and
 * TimeSlot facts the table displays.
 *
 * Unlike the customer-facing routes this deliberately returns EVERY status,
 * including `cancelled` — the Admin's list is a record of what happened, not a
 * board of what is actionable, and hiding cancellations would make an accidental
 * cancel invisible and unauditable. Soft-deleted rows are still excluded; that
 * is the schema hook's job and is not an Admin-visible state.
 *
 * Both filters are optional and are applied as exact matches on values the
 * controller has already validated against a fixed shape — `status` against
 * `APPOINTMENT_STATUSES`, `date` against a literal YYYY-MM-DD pattern. Nothing
 * raw from the query string reaches the database filter, which rules out
 * NoSQL-injection via `?status[$ne]=`.
 *
 * The `date` filter is a two-step lookup rather than a join: `date` lives on
 * TimeSlot, so the matching slots are resolved to _ids first and the Appointment
 * query filters on `timeSlotId: { $in: ... }`. An empty slot set short-circuits
 * to `[]` — no day's slots means no day's appointments.
 */
export async function listAppointments(
  filter: ListAppointmentsFilter = {},
): Promise<AppointmentReceipt[]> {
  const query: Record<string, unknown> = {}

  if (filter.status !== undefined) query.status = filter.status

  if (filter.date !== undefined) {
    const slots = await TimeSlot.find({ date: filter.date }).select('_id').lean()
    // No slot on that day means no appointment on that day. Returning early
    // also avoids issuing an `$in: []` query whose result is trivially empty.
    if (slots.length === 0) return []
    query.timeSlotId = { $in: slots.map((slot) => slot._id) }
  }

  const docs = await Appointment.find(query)
    .populate<{ serviceId: { uuid: string; name: string; durationMinutes: number; price: number } }>(
      'serviceId',
      'uuid name durationMinutes price',
    )
    .populate<{
      timeSlotId: { uuid: string; date: string; startTime: string; endTime: string }
    }>('timeSlotId', 'uuid date startTime endTime')
    .sort({ createdAt: -1 })
    .lean()

  return (
    docs
      // A dangling ref means inconsistent data, not a caller error — but a
      // half-built row would violate the contract's required fields, so it is
      // dropped rather than serialized incomplete (same rule as the receipt).
      .filter((doc) => doc.serviceId && doc.timeSlotId)
      .map((doc) => toEnrichedAppointment(doc, doc.serviceId, doc.timeSlotId))
  )
}

export type AppointmentTransitionResult =
  | { outcome: 'updated'; appointment: AppointmentReceipt }
  | { outcome: 'not-found' }
  | { outcome: 'conflict' }

/**
 * Confirm an Appointment: `pending` -> `confirmed` (PRD F10).
 *
 * A SINGLE atomic conditional update — the precondition (`status: 'pending'`)
 * lives inside the filter, so MongoDB decides who wins a double-submit rather
 * than application code. A read-then-write here would let two Admin sessions,
 * or one double-clicked button, both observe `pending` and both "succeed".
 *
 * `deletedAt: null` is repeated explicitly: the schema's soft-delete hook covers
 * find/findOne/countDocuments only, NOT findOneAndUpdate.
 *
 * The resulting status is determined by which function was called; it is never
 * read from a request body.
 */
export async function confirmAppointment(id: string): Promise<AppointmentTransitionResult> {
  return transitionAppointment(id, { status: 'pending' }, 'confirmed')
}

/**
 * Cancel an Appointment: `pending` | `confirmed` -> `cancelled` (PRD F11), and
 * release its TimeSlot back to `open`.
 *
 * Both source states are allowed exactly as F11 states: a pending appointment
 * the Admin does not want to honour must be cancellable without first being
 * confirmed (plan 013, Open Question 2).
 *
 * This is the only Admin action that mutates two collections, so the ordering
 * below is load-bearing (plan 013, Open Question 3 and Risks):
 *
 * 1. The Appointment transition goes FIRST and is the atomic precondition. Only
 *    the caller that wins that single conditional update proceeds — so two
 *    concurrent cancels yield exactly one `cancelled` and one 409, and the slot
 *    is released exactly once. Releasing first would let the loser of the race
 *    free a slot it never cancelled.
 * 2. The slot release runs only for the winner, and is idempotent: an already
 *    `open` or missing slot is a no-op success (see `releaseTimeSlot`). The
 *    Appointment's own status is the authoritative record of the Admin's action,
 *    so a slot that is already free must never fail the cancel.
 *
 * The residual risk is deliberate and recorded: if the process dies between the
 * two writes, the Appointment is `cancelled` while its slot stays `booked` —
 * a stranded slot. That direction is the safe one (nothing is double-booked,
 * and re-running the cancel is not needed since the slot can be reopened), and
 * closing it fully needs a transaction across both collections, which is out of
 * scope for this ticket.
 */
export async function cancelAppointment(id: string): Promise<AppointmentTransitionResult> {
  const result = await transitionAppointment(
    id,
    // Both source states, per F11. `$in` on a hardcoded literal — never a value
    // derived from the request.
    { status: { $in: ['pending', 'confirmed'] } },
    'cancelled',
  )

  if (result.outcome !== 'updated') return result

  // Only the winner of the atomic transition above reaches here, so the slot is
  // released exactly once even under concurrent cancels. Idempotent and
  // non-fatal by contract — its return value is informational only.
  await releaseTimeSlot(result.appointment.timeSlotId)

  return result
}

/**
 * The shared atomic status transition behind confirm and cancel.
 *
 * `precondition` is always a hardcoded literal supplied by the caller above,
 * never anything derived from a request; `id` is uuid-validated by the
 * controller before it reaches this filter.
 *
 * Distinguishing 404 from 409 is done AFTER the write, off the write path,
 * where the extra read can no longer widen the race — the same pattern
 * `holdTimeSlot` uses.
 */
async function transitionAppointment(
  id: string,
  precondition: Record<string, unknown>,
  next: AppointmentStatus,
): Promise<AppointmentTransitionResult> {
  const updated = await Appointment.findOneAndUpdate(
    // `deletedAt: null` is explicit — the soft-delete hook does not cover
    // findOneAndUpdate.
    { uuid: id, deletedAt: null, ...precondition },
    { $set: { status: next } },
    { new: true, runValidators: true },
  )
    .populate<{ serviceId: { uuid: string; name: string; durationMinutes: number; price: number } }>(
      'serviceId',
      'uuid name durationMinutes price',
    )
    .populate<{
      timeSlotId: { uuid: string; date: string; startTime: string; endTime: string }
    }>('timeSlotId', 'uuid date startTime endTime')
    .lean()

  if (!updated) {
    // The conditional update matched nothing. Only now do we look up why: the
    // Appointment does not exist (404), or it exists in a status this
    // transition does not allow (409).
    const exists = await Appointment.exists({ uuid: id, deletedAt: null })
    return exists ? { outcome: 'conflict' } : { outcome: 'not-found' }
  }

  // A dangling ref would produce a response missing contract-required fields.
  // Treated as not-found rather than serialized incomplete — consistent with
  // the receipt route. The status transition itself has already committed.
  if (!updated.serviceId || !updated.timeSlotId) return { outcome: 'not-found' }

  return {
    outcome: 'updated',
    appointment: toEnrichedAppointment(updated, updated.serviceId, updated.timeSlotId),
  }
}
