/**
 * Business logic for outbound notifications.
 *
 * Real email/SMS provider integration is deliberately out of scope for this
 * ticket (CUSTOMER-NOT): PRD F4b only requires that a booking *triggers* a
 * confirmation notification. Delivery here is stubbed — the notification is
 * recorded and logged, which is the seam a real provider adapter will replace.
 */

export type AppointmentConfirmation = {
  appointmentId: string
  serviceName: string
  date: string
  startTime: string
  customerName: string
  customerPhone: string
  customerEmail?: string
}

export type NotificationRecord = AppointmentConfirmation & {
  channel: 'stub'
  kind: 'appointment-confirmation'
  sentAt: string
}

// In-memory only, and intentionally so: this service owns no collection, and
// this record exists to make the stub observable (tests, local debugging).
// It is never exposed over HTTP.
const sent: NotificationRecord[] = []

/**
 * Records + "sends" a booking-confirmation notification.
 *
 * `customerName` is attacker-controlled free text that arrived from a public,
 * unauthenticated booking form. It is stored verbatim and never interpolated
 * into a template or a query — the log line below passes it as a separate
 * argument rather than building a string with it.
 */
export function sendAppointmentConfirmation(
  payload: AppointmentConfirmation,
): NotificationRecord {
  const record: NotificationRecord = {
    ...payload,
    channel: 'stub',
    kind: 'appointment-confirmation',
    sentAt: new Date().toISOString(),
  }

  sent.push(record)

  // No phone/email is logged: those are PII, and the appointment id is enough
  // to correlate this line with the booking in booking-service.
  console.log(
    '[NOTIFICATION] appointment-confirmation queued for appointment',
    record.appointmentId,
    'on',
    `${record.date} ${record.startTime}`,
  )

  return record
}

/** Test/diagnostic helper — not reachable over HTTP. */
export function getSentNotifications(): readonly NotificationRecord[] {
  return sent
}

/** Test helper — clears the in-memory record between test cases. */
export function resetSentNotifications(): void {
  sent.length = 0
}
