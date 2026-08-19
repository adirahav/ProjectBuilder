import type { Request, Response } from 'express'

import { isDbConnected } from '../lib/db.ts'
import { createAppointment, getAppointmentReceipt } from './appointment.service.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Deliberately conservative rather than RFC-complete: a local part, one @, a
// dotted domain, no whitespace. Over-clever email regexes are a known footgun,
// and the cost of rejecting an exotic-but-valid address is far lower here than
// the cost of storing junk in the one field used to contact a Customer.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

const NAME_MAX = 60
const PHONE_MIN = 9
const PHONE_MAX = 20
const EMAIL_MAX = 254

/**
 * A well-formed uuid, and a string. A crafted JSON body can put an object or an
 * array where a string belongs (`{"slotId": {"$ne": null}}`) — that must be
 * rejected outright rather than reaching a database filter.
 */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * POST /api/appointments — public, unauthenticated by design (PRD F4).
 * A Customer has no account and never logs in.
 *
 * Validation is strict and total: nothing is coerced, and no partial record is
 * ever stored. The body is the one place a Customer controls free text, and
 * this endpoint is a public mutation that persists PII — so every field is
 * type-checked as well as shape-checked before it reaches the service layer.
 */
export async function postAppointment(req: Request, res: Response): Promise<void> {
  // A DB that is not connected is a 503 (transient, retryable) rather than a
  // 500, so the frontend can distinguish "come back later" from a real bug.
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const body: unknown = req.body
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' })
    return
  }

  const { slotId, serviceId, customerName, customerPhone, customerEmail } = body as Record<
    string,
    unknown
  >

  if (!isUuid(slotId)) {
    res.status(400).json({ error: 'Field "slotId" must be a uuid' })
    return
  }
  if (!isUuid(serviceId)) {
    res.status(400).json({ error: 'Field "serviceId" must be a uuid' })
    return
  }

  // Free text, and the one field a Customer fully controls. Trimmed for the
  // emptiness check and stored trimmed, but otherwise kept verbatim — no
  // sanitizing, no escaping at rest. Escaping is the responsibility of whatever
  // renders it, and mangling it here would corrupt legitimate names.
  if (typeof customerName !== 'string' || customerName.trim().length === 0) {
    res.status(400).json({ error: 'Field "customerName" is required' })
    return
  }
  if (customerName.trim().length > NAME_MAX) {
    res.status(400).json({ error: `Field "customerName" must be at most ${NAME_MAX} characters` })
    return
  }

  if (typeof customerPhone !== 'string' || customerPhone.trim().length === 0) {
    res.status(400).json({ error: 'Field "customerPhone" is required' })
    return
  }
  const phone = customerPhone.trim()
  // Formatting characters (spaces, hyphens, parentheses, a leading +) are
  // permitted: the clinic dials this, it is not a normalized key.
  if (phone.length < PHONE_MIN || phone.length > PHONE_MAX) {
    res.status(400).json({
      error: `Field "customerPhone" must be between ${PHONE_MIN} and ${PHONE_MAX} characters`,
    })
    return
  }

  // Optional by design (PRD F4) — a Customer without email can still book. An
  // absent field is fine; a present-but-malformed one is a 400, never silently
  // dropped, because a typo'd address is a Customer who never hears from us.
  let email: string | undefined
  if (customerEmail !== undefined && customerEmail !== null && customerEmail !== '') {
    if (typeof customerEmail !== 'string' || !EMAIL_RE.test(customerEmail.trim())) {
      res.status(400).json({ error: 'Field "customerEmail" must be a valid email address' })
      return
    }
    if (customerEmail.trim().length > EMAIL_MAX) {
      res.status(400).json({ error: `Field "customerEmail" must be at most ${EMAIL_MAX} characters` })
      return
    }
    email = customerEmail.trim()
  }

  try {
    // `status` is never read from the body — this endpoint always creates
    // `pending`, and always transitions the slot `held` -> `booked`.
    const result = await createAppointment({
      slotId,
      serviceId,
      customerName: customerName.trim(),
      customerPhone: phone,
      customerEmail: email,
    })

    if (result.outcome === 'not-found') {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    if (result.outcome === 'service-mismatch') {
      // 400, not 404: the slot exists, the client just described it wrongly.
      res.status(400).json({ error: 'Field "serviceId" does not match the TimeSlot' })
      return
    }
    if (result.outcome === 'conflict') {
      // Expected under normal use, not a fault — the hold lapsed or another
      // request booked it first. The frontend maps this to its own "the hold
      // ran out" copy and a route back to the Time Slot Picker.
      res.status(409).json({ error: 'TimeSlot is no longer held' })
      return
    }

    res.status(201).json(result.appointment)
  } catch (err) {
    // Never leak a stack trace or a raw Mongoose error to the client.
    console.error('booking-service: POST /api/appointments failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * GET /api/appointments/:id — public and unauthenticated, like the rest of the
 * booking flow (PRD Screen 4). Read-only: it mutates nothing.
 *
 * Screen 4 is the only receipt the Customer gets, so it has to survive a
 * reload, a bookmark, or the link being opened later — at which point the id in
 * the URL is all that is left of the booking client-side.
 *
 * SECURITY, deliberately recorded rather than assumed away: this id is the only
 * thing guarding a record containing a Customer's name, phone and email. That
 * makes it a capability token, which it only is because it is a random uuid v4
 * (the model's `randomUUID` default) and never a sequential/enumerable value.
 * Even so, id enumeration remains a real PII-exposure surface here; rate
 * limiting on this route and a separate opaque confirmation token are known
 * follow-ups outside this ticket's scope. Two consequences are enforced below:
 *   - a malformed id is 400 and a non-existent one 404, but both carry the SAME
 *     generic body, so the response can never be used to tell "exists" from
 *     "does not";
 *   - the id is uuid-validated before it reaches a query filter, so a crafted
 *     path segment can never become an operator object.
 */
export async function getAppointment(req: Request, res: Response): Promise<void> {
  // Transient and retryable, so 503 rather than 500 — the frontend distinguishes
  // "come back later" from a real bug and can retry the receipt fetch.
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { id } = req.params
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Not Found' })
    return
  }

  try {
    const receipt = await getAppointmentReceipt(id)

    if (!receipt) {
      // An ordinary outcome of a stale or mistyped link, not a fault — the
      // frontend renders "we could not find that booking" with a way back to
      // the Service List.
      res.status(404).json({ error: 'Not Found' })
      return
    }

    res.status(200).json(receipt)
  } catch (err) {
    // Never leak a stack trace or a raw Mongoose error to the client.
    console.error('booking-service: GET /api/appointments/:id failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
