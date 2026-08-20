import { HOLD_TTL_MS } from '../lib/config.ts'
import { Service } from '../models/service.model.ts'
import { TimeSlot } from '../models/time-slot.model.ts'

// Exactly the fields the contract's TimeSlot schema allows
// (additionalProperties: false) — nothing else is ever serialized. `heldAt` is
// deliberately absent: the hold deadline is server-side bookkeeping.
export interface PublicTimeSlot {
  id: string
  serviceId: string
  date: string
  startTime: string
  endTime: string
  status: 'open' | 'held' | 'booked'
  // Present ONLY on a successful hold response, where `status` is `held`.
  // Advisory: it lets Screen 3 show the Customer how long is left, but the
  // server never trusts it back — POST /api/appointments re-checks expiry
  // itself, and its 409 is the authoritative backstop.
  holdExpiresAt?: string
}

/** The instant before which a hold is considered expired. */
export function holdExpiryCutoff(): Date {
  return new Date(Date.now() - HOLD_TTL_MS)
}

/**
 * Release every hold that has outlived the TTL.
 *
 * This is the lazy expiry sweep (PRD F3b): with no background job yet, a read
 * is what heals a stale hold. The precondition (`status: 'held'` AND an expired
 * `heldAt`) lives inside the update's own filter, so this is a condition-checked
 * atomic write — it can never clobber a hold that was placed a moment ago, even
 * if it races with one.
 *
 * Scoped to the slots being queried rather than the whole collection, so a
 * single customer's page view doesn't sweep unrelated documents.
 */
async function expireStaleHolds(serviceObjectId: unknown, date: string): Promise<void> {
  await TimeSlot.updateMany(
    {
      serviceId: serviceObjectId,
      date,
      status: 'held',
      heldAt: { $lt: holdExpiryCutoff() },
    },
    { $set: { status: 'open', heldAt: null } },
  )
}

/**
 * The bookable slots for one Service on one calendar day.
 *
 * Both arguments are already validated by the controller, and the Service uuid
 * is resolved to an internal _id here — a raw client string never reaches the
 * database filter, which rules out NoSQL injection via the query string.
 *
 * An unknown or deactivated Service yields an empty list rather than an error:
 * the contract defines no 404 for this route, and "nothing bookable" is a valid,
 * expected result.
 */
export async function listOpenTimeSlots(
  serviceUuid: string,
  date: string,
): Promise<PublicTimeSlot[]> {
  // `isActive: true` keeps a deactivated Service's slots off the public board;
  // `deletedAt: null` is added by the Service schema hook.
  const service = await Service.findOne({ uuid: serviceUuid, isActive: true })
    .select('_id uuid')
    .lean()

  if (!service) return []

  // Heal stale holds first, so the read below sees them as open again.
  await expireStaleHolds(service._id, date)

  const docs = await TimeSlot.find({ serviceId: service._id, date, status: 'open' })
    .select('uuid date startTime endTime status')
    .sort({ startTime: 1 })
    .lean()

  return docs.map((doc) => ({
    id: doc.uuid,
    serviceId: service.uuid,
    date: doc.date,
    startTime: doc.startTime,
    endTime: doc.endTime,
    status: 'open' as const,
  }))
}

export type HoldResult =
  | { outcome: 'held'; slot: PublicTimeSlot }
  | { outcome: 'not-found' }
  | { outcome: 'conflict' }

/**
 * Atomically claim a slot: `open` -> `held`.
 *
 * This is the single most concurrency-sensitive operation in the service. The
 * precondition and the write are ONE `findOneAndUpdate`, so MongoDB's
 * per-document atomicity — not application code — decides who wins the race.
 * A read-then-write here would let two simultaneous requests both observe
 * `open` and both succeed, double-booking the slot (`seat-concurrency-layer`).
 *
 * The filter also admits a slot whose hold has already expired past the TTL,
 * so an abandoned checkout doesn't strand the time even if no list query has
 * swept it yet.
 *
 * `status` is never read from a request body — reaching this function is what
 * determines the resulting status.
 */
export async function holdTimeSlot(slotUuid: string): Promise<HoldResult> {
  const slot = await TimeSlot.findOneAndUpdate(
    {
      uuid: slotUuid,
      $or: [
        { status: 'open' },
        // An expired hold is effectively open and may be re-held.
        { status: 'held', heldAt: { $lt: holdExpiryCutoff() } },
      ],
    },
    { $set: { status: 'held', heldAt: new Date() } },
    { new: true },
  )
    .populate<{ serviceId: { uuid: string } }>('serviceId', 'uuid')
    .lean()

  if (slot) {
    return {
      outcome: 'held',
      slot: {
        id: slot.uuid,
        serviceId: slot.serviceId.uuid,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: 'held',
        // The already-computed deadline, not the raw `heldAt` stamp: exposing
        // when the hold *started* would invite a client to recompute an expiry
        // only the server gets to decide.
        holdExpiresAt: new Date(slot.heldAt!.getTime() + HOLD_TTL_MS).toISOString(),
      },
    }
  }

  // The update matched nothing. Only NOW — off the write path, where it can no
  // longer cause a race — do we look up why, to tell 404 from 409 apart.
  const exists = await TimeSlot.exists({ uuid: slotUuid })
  return exists ? { outcome: 'conflict' } : { outcome: 'not-found' }
}

/**
 * Release a slot back to `open` — the `booked` -> `open` (and `held` -> `open`)
 * transition an Admin cancellation triggers (PRD F11).
 *
 * This lives here, in the module that owns `TimeSlot`, rather than in
 * `appointment.service.ts`, precisely because it is a status write: every write
 * to this field goes through exactly one module, so the transition table in
 * `seat-concurrency-layer` has a single source of truth. `appointment.service`
 * calls this; it never reaches into `TimeSlot` with an ad hoc update.
 *
 * The write is a condition-checked atomic update, not a read-then-write: the
 * precondition (`status` is currently `held` or `booked`) lives inside the
 * filter, so two concurrent cancels of the same appointment cannot both "see"
 * a booked slot and both release it. `heldAt` is cleared in the same operation,
 * so a released slot never carries stale hold bookkeeping into its next hold.
 *
 * Idempotent by design (plan 013, Open Question 3): a slot that is already
 * `open`, or a uuid that resolves to nothing, is a no-op SUCCESS, not an error.
 * The Appointment's own status is the authoritative record of the Admin's
 * action — a slot that is already free must never block a cancellation, and
 * "already open" is exactly the state we were trying to reach anyway.
 *
 * Returns `true` when this call is what flipped the slot, `false` when there
 * was nothing to flip. Callers use it for logging/assertions only; neither
 * value is a failure.
 */
export async function releaseTimeSlot(slotUuid: string): Promise<boolean> {
  const released = await TimeSlot.findOneAndUpdate(
    // Only a slot that is actually claimed is released. Matching on the current
    // status is what makes a double-release a no-op instead of a second write.
    { uuid: slotUuid, status: { $in: ['held', 'booked'] } },
    { $set: { status: 'open', heldAt: null } },
    { new: true },
  )
    .select('uuid')
    .lean()

  return released !== null
}
