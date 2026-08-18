import type { Request, Response } from 'express'

import { isDbConnected } from '../lib/db.ts'
import { holdTimeSlot, listOpenTimeSlots } from './time-slot.service.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A well-formed uuid, and a string — Express can hand back an array or an
 * object for a repeated/crafted query parameter (`?serviceId[$ne]=x`), and that
 * must be rejected outright rather than reaching a database filter.
 */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * A real calendar day in YYYY-MM-DD form. The shape check alone isn't enough —
 * `2026-02-31` matches the pattern but isn't a day — so the parsed date is
 * round-tripped to confirm it didn't roll over into the next month.
 */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return false

  return parsed.toISOString().startsWith(value)
}

/**
 * GET /api/time-slots?serviceId=&date= — public, unauthenticated (PRD F2).
 * Returns only slots whose effective status is `open`.
 */
export async function getTimeSlots(req: Request, res: Response): Promise<void> {
  // A DB that is not connected is a 503 (transient, retryable) rather than a
  // 500, so the frontend can distinguish "come back later" from a real bug.
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { serviceId, date } = req.query

  // Both parameters are required, and malformed input is rejected rather than
  // coerced — a bad day is a client bug, not an empty result.
  if (!isUuid(serviceId)) {
    res.status(400).json({ error: 'Query parameter "serviceId" must be a uuid' })
    return
  }
  if (!isCalendarDate(date)) {
    res.status(400).json({ error: 'Query parameter "date" must be a YYYY-MM-DD calendar day' })
    return
  }

  try {
    const slots = await listOpenTimeSlots(serviceId, date)
    res.status(200).json(slots)
  } catch (err) {
    // Never leak a stack trace or a raw Mongoose error to the client.
    console.error('booking-service: GET /api/time-slots failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * POST /api/time-slots/:id/hold — public, unauthenticated (PRD F3).
 *
 * The request has no body, and none is read: nothing a client sends can
 * influence the resulting status. Calling this endpoint is itself the entire
 * instruction, and the transition is `open` -> `held`, always.
 *
 * A 409 here is an expected outcome of normal concurrent use, not a fault —
 * it's how the frontend learns to re-fetch and show "that time was just taken".
 */
export async function postTimeSlotHold(req: Request, res: Response): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { id } = req.params
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Path parameter "id" must be a uuid' })
    return
  }

  try {
    const result = await holdTimeSlot(id)

    if (result.outcome === 'not-found') {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    if (result.outcome === 'conflict') {
      res.status(409).json({ error: 'TimeSlot is no longer open' })
      return
    }

    res.status(200).json(result.slot)
  } catch (err) {
    console.error('booking-service: POST /api/time-slots/:id/hold failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
