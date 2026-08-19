import 'dotenv/config'

// booking-service owns Service / TimeSlot / Appointment, so it needs a database.
// It never signs or verifies JWTs — auth is enforced at api-gateway, which
// forwards the x-internal-admin header. So there is deliberately no JWT_SECRET here.
export const config = {
  port: Number(process.env.PORT ?? 4001),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/booking-service',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  // Server-to-server only: booking-service fires a best-effort confirmation
  // notification here after an Appointment is created (PRD F4b). This is never
  // reached by a browser, and its unavailability must never cost a booking.
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:4003',
}

/**
 * How long booking-service waits on the notification-service call before giving
 * up. Deliberately short: the notification is fire-and-forget, so a hung
 * upstream must not be able to pin an open handle for the life of the process.
 */
export const NOTIFICATION_TIMEOUT_MS = 3000

/**
 * How long a TimeSlot hold survives before it lazily expires back to `open`.
 *
 * 5 minutes (plan 008, Open Question 1): long enough for a customer to fill in
 * the contact form on Screen 3, short enough that an abandoned checkout doesn't
 * keep a popular slot off the board. Kept as a single constant so it can be
 * tuned in one place.
 *
 * There is no background sweeper yet — expiry is applied lazily on read and on
 * the hold attempt itself.
 */
export const HOLD_TTL_MS = 5 * 60 * 1000
