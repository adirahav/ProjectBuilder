import type { Request, Response } from 'express'

import {
  sendAppointmentConfirmation,
  type AppointmentConfirmation,
} from './notification.service.ts'

/**
 * POST /api/notifications/appointment-confirmation
 *
 * Server-to-server only (PRD F4b): booking-service calls this best-effort
 * after an Appointment is created. The caller does NOT depend on this
 * response — a failure here must never cost a Customer their booking — so the
 * handler stays cheap and never does anything the caller has to wait on.
 *
 * Validation already ran in the middleware; this reads the narrowed payload
 * off res.locals rather than req.body.
 */
export function postAppointmentConfirmation(_req: Request, res: Response): void {
  const confirmation = res.locals.confirmation as AppointmentConfirmation

  try {
    const record = sendAppointmentConfirmation(confirmation)

    // Echoes back only what the caller needs to correlate the call — no PII
    // (phone/email) is reflected in the response.
    res.status(202).json({
      status: 'accepted',
      kind: record.kind,
      appointmentId: record.appointmentId,
      sentAt: record.sentAt,
    })
  } catch (err) {
    console.error(
      'notification-service: POST /api/notifications/appointment-confirmation failed:',
      (err as Error).message,
    )
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
