import type { Request, Response } from 'express'

import { forwardAppointmentRequest, UpstreamUnavailableError } from './appointment-proxy.service.ts'

const UPSTREAM_ERROR = { error: 'Booking service unavailable' }
const NOT_FOUND_ERROR = { error: 'Appointment not found' }
const CONFLICT_ERROR = { error: 'Appointment is not in a status this transition is allowed from' }

// 8-4-4-4-12 hex, any version. The contract types every Appointment `id` as a
// uuid, so anything else cannot name an existing record.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// `YYYY-MM-DD`. Shape only — calendarDateError below also rejects a well-shaped
// but non-existent day such as 2026-02-30.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled'] as const

// verifyJwt has already run on every route in this module, so `req.admin` is
// always present; the fallback exists only to satisfy the type.
function adminId(req: Request): string {
  return req.admin?.sub ?? ''
}

function fail(res: Response, message: string): void {
  res.status(400).json({ error: message })
}

// --- Filter validators ------------------------------------------------------
// Both filters are independent and optional. A value that is absent — or an
// explicitly empty string — means "do not narrow by this", never "match empty":
// it is dropped rather than forwarded, so booking-service can never receive a
// filter that matches nothing by accident. A value that is present and
// non-empty must parse, or the request is a 400.

function calendarDateError(value: string): string | null {
  if (!DATE_PATTERN.test(value)) {
    return 'date must be a calendar date in YYYY-MM-DD format'
  }
  // Round-trips through Date to reject a well-shaped impossible day. Parsed as
  // UTC so the host's timezone can never shift the day boundary.
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return 'date must be a calendar date in YYYY-MM-DD format'
  }
  return null
}

// Express hands back a string for a single occurrence and an ARRAY when the
// same key is repeated (`?status=pending&status=cancelled`). An array is never
// a valid filter, so it is rejected rather than silently reduced to one value.
type FilterRead =
  | { kind: 'absent' }
  | { kind: 'value'; value: string }
  | { kind: 'invalid' }

function readFilter(raw: unknown): FilterRead {
  if (raw === undefined) {
    return { kind: 'absent' }
  }
  if (typeof raw !== 'string') {
    return { kind: 'invalid' }
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { kind: 'absent' }
  }
  return { kind: 'value', value: trimmed }
}

// Maps a booking-service status onto this contract's vocabulary. Anything the
// contract does not define for the route is an upstream failure (502), never a
// pass-through of an unexpected status.
function relayError(
  res: Response,
  status: number,
  body: unknown,
  allow: { notFound?: boolean; conflict?: boolean; badRequest?: boolean },
): void {
  const upstreamMessage =
    typeof (body as { error?: unknown })?.error === 'string'
      ? (body as { error: string }).error
      : null

  if (status === 400 && allow.badRequest) {
    res.status(400).json({ error: upstreamMessage ?? 'Invalid request' })
    return
  }

  if (status === 404 && allow.notFound) {
    res.status(404).json(NOT_FOUND_ERROR)
    return
  }

  // 409 is the answer to a race, not to bad input: booking-service applies the
  // transition as a single conditional update matching on the current status,
  // so of two near-simultaneous requests exactly one succeeds and the other
  // lands here. Its message names the status actually required, so it is
  // relayed rather than flattened.
  if (status === 409 && allow.conflict) {
    res.status(409).json(upstreamMessage ? { error: upstreamMessage } : CONFLICT_ERROR)
    return
  }

  // Includes booking-service's 503 (database not connected): from the Admin's
  // point of view the gateway simply could not reach the service.
  res.status(502).json(UPSTREAM_ERROR)
}

function handleUpstreamThrow(res: Response, error: unknown): void {
  if (error instanceof UpstreamUnavailableError) {
    res.status(502).json(UPSTREAM_ERROR)
    return
  }
  res.status(502).json(UPSTREAM_ERROR)
}

// --- Handlers ---------------------------------------------------------------

// GET /api/appointments — F9. Every Appointment on record, every status
// included, optionally narrowed by date and/or status.
//
// This response aggregates customer names, phone numbers and email addresses
// across the whole clinic. It is mounted behind verifyJwt at the mount point in
// app.ts, which is the single reason the route exists here at all.
export async function getAppointments(req: Request, res: Response): Promise<void> {
  const query = new URLSearchParams()

  const date = readFilter(req.query.date)
  if (date.kind === 'invalid') {
    fail(res, 'date must be a calendar date in YYYY-MM-DD format')
    return
  }
  if (date.kind === 'value') {
    const problem = calendarDateError(date.value)
    if (problem) {
      fail(res, problem)
      return
    }
    // Past days are valid — the Admin genuinely needs to look back at yesterday.
    query.set('date', date.value)
  }

  const status = readFilter(req.query.status)
  if (status.kind === 'invalid') {
    fail(res, `status must be one of ${APPOINTMENT_STATUSES.join(', ')}`)
    return
  }
  if (status.kind === 'value') {
    if (!(APPOINTMENT_STATUSES as readonly string[]).includes(status.value)) {
      fail(res, `status must be one of ${APPOINTMENT_STATUSES.join(', ')}`)
      return
    }
    query.set('status', status.value)
  }

  try {
    const upstream = await forwardAppointmentRequest({
      method: 'GET',
      path: '',
      internalAdminId: adminId(req),
      query,
    })

    if (upstream.status === 200) {
      // An empty array is a valid, successful answer — an empty diary and a
      // filter that matched nothing are both 200.
      res.status(200).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, { badRequest: true })
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}

// PATCH /api/appointments/:id/confirm — F10. `pending` -> `confirmed` and
// nothing else. No request body is accepted or relayed, and the linked TimeSlot
// is deliberately untouched: it is already `booked`, and confirming is the
// Admin agreeing to honour it.
export async function patchConfirmAppointment(req: Request, res: Response): Promise<void> {
  const id = req.params.id
  if (!UUID_PATTERN.test(id)) {
    res.status(404).json(NOT_FOUND_ERROR)
    return
  }

  try {
    const upstream = await forwardAppointmentRequest({
      method: 'PATCH',
      path: `/${encodeURIComponent(id)}/confirm`,
      internalAdminId: adminId(req),
    })

    if (upstream.status === 200) {
      res.status(200).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, { notFound: true, conflict: true })
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}

// PATCH /api/appointments/:id/cancel — F11. `pending` or `confirmed` ->
// `cancelled`, and booking-service releases the linked TimeSlot back to `open`
// as part of the same operation.
//
// The slot release is deliberately NOT a second call from here: a gateway that
// cancelled the booking and then failed its own follow-up request would strand
// a time nobody could ever book. booking-service owns both collections and is
// the only place that write belongs.
export async function patchCancelAppointment(req: Request, res: Response): Promise<void> {
  const id = req.params.id
  if (!UUID_PATTERN.test(id)) {
    res.status(404).json(NOT_FOUND_ERROR)
    return
  }

  try {
    const upstream = await forwardAppointmentRequest({
      method: 'PATCH',
      path: `/${encodeURIComponent(id)}/cancel`,
      internalAdminId: adminId(req),
    })

    if (upstream.status === 200) {
      res.status(200).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, { notFound: true, conflict: true })
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}
