import { config, NOTIFICATION_TIMEOUT_MS } from './config.ts'

/**
 * The minimal payload notification-service's confirmation endpoint accepts
 * (plan 009, Open Question 4). Intentionally small — real email/SMS delivery
 * integration is out of scope, this only has to satisfy F4b's "triggers a
 * confirmation notification" contract.
 */
export interface AppointmentConfirmationPayload {
  appointmentId: string
  serviceName: string
  date: string
  startTime: string
  customerName: string
  customerPhone: string
  customerEmail?: string
}

/**
 * Fire the confirmation notification (PRD F4b) — BEST EFFORT, always.
 *
 * This function can never reject and never throws: every failure path is caught
 * and logged. That is the whole point. `POST /api/appointments` has, by the time
 * this is called, already had the datastore accept a booking and flip a TimeSlot
 * to `booked`; a notification-service outage must never cost a Customer that
 * booking, and there is nothing here to roll back to if it did.
 *
 * The timeout matters as much as the catch: without it a hung upstream would
 * hold the request open indefinitely, turning "fire-and-forget" back into a
 * hard dependency on notification-service's availability.
 *
 * `customerName` is attacker-controlled free text. It is passed as a JSON string
 * value only — never interpolated into a URL, a query, or a template here.
 */
export async function sendAppointmentConfirmation(
  payload: AppointmentConfirmationPayload,
): Promise<void> {
  try {
    const res = await fetch(
      `${config.notificationServiceUrl}/api/notifications/appointment-confirmation`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS),
      },
    )

    if (!res.ok) {
      // A non-2xx is logged and dropped — the booking still stands.
      console.error(
        `booking-service: confirmation notification rejected with ${res.status} for appointment ${payload.appointmentId}`,
      )
    }
  } catch (err) {
    // Network error, DNS failure, timeout, service down — all the same here.
    console.error(
      `booking-service: confirmation notification failed for appointment ${payload.appointmentId}:`,
      (err as Error).message,
    )
  }
}
