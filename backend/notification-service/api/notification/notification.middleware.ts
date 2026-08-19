import type { NextFunction, Request, Response } from 'express'

import type { AppointmentConfirmation } from './notification.service.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
// Deliberately conservative: this only gates an optional contact field, it is
// not an authority on address validity.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A non-empty, length-bounded string — and a string at all. A JSON body can
 * carry an object or an array in any field (`{"customerName":{"$ne":null}}`),
 * and that must be rejected outright rather than flowing onward.
 */
function isText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false

  // `2026-02-31` matches the shape but is not a day — round-trip to confirm it
  // did not roll over into the next month.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return false

  return parsed.toISOString().startsWith(value)
}

/**
 * Validates the appointment-confirmation payload and attaches the narrowed,
 * whitelisted result to `res.locals` — the controller reads only that, never
 * `req.body`, so no unexpected field can ride along into the notification.
 */
export function validateAppointmentConfirmation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body: unknown = req.body

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' })
    return
  }

  const {
    appointmentId,
    serviceName,
    date,
    startTime,
    customerName,
    customerPhone,
    customerEmail,
  } = body as Record<string, unknown>

  if (typeof appointmentId !== 'string' || !UUID_RE.test(appointmentId)) {
    res.status(400).json({ error: 'Field "appointmentId" must be a uuid' })
    return
  }
  if (!isText(serviceName, 1, 100)) {
    res.status(400).json({ error: 'Field "serviceName" is required' })
    return
  }
  if (!isCalendarDate(date)) {
    res.status(400).json({ error: 'Field "date" must be a YYYY-MM-DD calendar day' })
    return
  }
  if (typeof startTime !== 'string' || !TIME_RE.test(startTime)) {
    res.status(400).json({ error: 'Field "startTime" must be a HH:MM time of day' })
    return
  }
  if (!isText(customerName, 1, 60)) {
    res.status(400).json({ error: 'Field "customerName" is required' })
    return
  }
  if (!isText(customerPhone, 9, 20)) {
    res.status(400).json({ error: 'Field "customerPhone" is required' })
    return
  }

  // Optional — but malformed when present is a 400, never silently dropped.
  if (customerEmail !== undefined && customerEmail !== null && customerEmail !== '') {
    if (typeof customerEmail !== 'string' || !EMAIL_RE.test(customerEmail) || customerEmail.length > 254) {
      res.status(400).json({ error: 'Field "customerEmail" must be a well-formed email address' })
      return
    }
  }

  const validated: AppointmentConfirmation = {
    appointmentId,
    serviceName,
    date,
    startTime,
    customerName,
    customerPhone,
  }

  if (typeof customerEmail === 'string' && customerEmail !== '') {
    validated.customerEmail = customerEmail
  }

  res.locals.confirmation = validated

  next()
}
