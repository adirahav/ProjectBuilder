import type { Request, Response } from 'express'

import { isDbConnected } from '../lib/db.ts'
import { APPOINTMENT_STATUSES, type AppointmentStatus } from '../models/appointment.model.ts'
import {
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  getAppointmentReceipt,
  listAppointments,
  type AppointmentTransitionResult,
} from './appointment.service.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Deliberately conservative rather than RFC-complete: a local part, one @, a
// dotted domain, no whitespace. Over-clever email regexes are a known footgun,
// and the cost of rejecting an exotic-but-valid address is far lower here than
// the cost of storing junk in the one field used to contact a Customer.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

// A literal calendar day. Pattern-checked AND range-checked below — `9999-99-99`
// matches the shape but is not a real day, and a client must never be able to
// put an arbitrary string into a database filter.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
 * A real calendar day, not just the right shape: `2026-02-31` matches the
 * pattern but is not a day, so the parsed date is round-tripped back to a string
 * and compared. Mirrors `isCalendarDate` in time-slot.controller.ts.
 */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** One of the three known statuses — matched against the enum, never trusted raw. */
function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === 'string' && (APPOINTMENT_STATUSES as readonly string[]).includes(value)
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

// ---------------------------------------------------------------------------
// Admin Appointment management (PRD F9-F11).
//
// No auth middleware guards these handlers, and that is deliberate, not an
// oversight: api-gateway verifies the Admin JWT and only then forwards, exactly
// the trust boundary the Admin Service writes (F6-F8) already established. The
// consequence is that this service's port must NOT be publicly exposed — the
// list handler below returns every Customer's name, phone and email in one
// response, so an exposed port is a bulk PII leak, not just an open endpoint.
// ---------------------------------------------------------------------------

/**
 * GET /api/appointments?date=&status= — the Admin list (PRD F9).
 *
 * Both filters are optional; each is validated against a fixed shape before it
 * reaches the service layer, and an unrecognised value is a 400 rather than
 * being silently ignored — quietly dropping a bad `status` would show the Admin
 * the FULL list while their UI claims it is filtered, which is worse than an
 * error. Any other query parameter is ignored outright and never merged into
 * the database filter.
 */
export async function getAppointments(req: Request, res: Response): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { date, status } = req.query

  // Express parses `?date[$ne]=x` into an object — hence the type checks inside
  // the validators, not just a pattern test on an assumed string.
  if (date !== undefined && !isCalendarDate(date)) {
    res.status(400).json({ error: 'Query parameter "date" must be a YYYY-MM-DD calendar day' })
    return
  }
  if (status !== undefined && !isAppointmentStatus(status)) {
    res.status(400).json({
      error: `Query parameter "status" must be one of: ${APPOINTMENT_STATUSES.join(', ')}`,
    })
    return
  }

  try {
    const appointments = await listAppointments({
      ...(date !== undefined ? { date } : {}),
      ...(status !== undefined ? { status } : {}),
    })

    // An empty array is a valid, expected result — an Admin with nothing booked
    // that day is not an error.
    res.status(200).json(appointments)
  } catch (err) {
    console.error('booking-service: GET /api/appointments failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * PATCH /api/appointments/:id/confirm — `pending` -> `confirmed` (PRD F10).
 *
 * The request has no body, and none is read: the endpoint that was called
 * determines the resulting status. A client can never name the status it wants.
 */
export async function patchConfirmAppointment(req: Request, res: Response): Promise<void> {
  await handleTransition(req, res, 'confirm', confirmAppointment)
}

/**
 * PATCH /api/appointments/:id/cancel — `pending`|`confirmed` -> `cancelled`
 * (PRD F11), which also releases the linked TimeSlot back to `open`.
 *
 * Bodyless for the same reason as confirm.
 */
export async function patchCancelAppointment(req: Request, res: Response): Promise<void> {
  await handleTransition(req, res, 'cancel', cancelAppointment)
}

/**
 * The shared request/response handling behind both Admin transitions — validate
 * the id, map the service's discriminated outcome to a status code, never leak
 * an internal error.
 *
 * 409 (not 404) for a wrong-status transition is meaningful to the Admin UI: it
 * means "someone already acted on this", so the row is stale and should be
 * refetched — distinct from "that appointment is gone".
 */
async function handleTransition(
  req: Request,
  res: Response,
  action: 'confirm' | 'cancel',
  transition: (id: string) => Promise<AppointmentTransitionResult>,
): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { id } = req.params
  // Validated before it can reach a query filter, so a crafted path segment can
  // never become an operator object.
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Not Found' })
    return
  }

  try {
    const result = await transition(id)

    if (result.outcome === 'not-found') {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    if (result.outcome === 'conflict') {
      res.status(409).json({ error: `Appointment cannot be ${action}ed from its current status` })
      return
    }

    res.status(200).json(result.appointment)
  } catch (err) {
    console.error(
      `booking-service: PATCH /api/appointments/:id/${action} failed:`,
      (err as Error).message,
    )
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
