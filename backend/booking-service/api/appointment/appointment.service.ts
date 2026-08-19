import { Appointment } from '../models/appointment.model.ts'
import { TimeSlot } from '../models/time-slot.model.ts'
import { sendAppointmentConfirmation } from '../lib/notification-client.ts'
import { holdExpiryCutoff } from '../time-slot/time-slot.service.ts'

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
