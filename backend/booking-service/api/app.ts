import express, { type Express } from 'express'
import cors from 'cors'

import { config } from './lib/config.ts'
import { getDbStatus, isDbConnected } from './lib/db.ts'
import { appointmentRouter } from './appointment/appointment.routes.ts'
import { serviceRouter } from './service/service.routes.ts'
import { timeSlotRouter } from './time-slot/time-slot.routes.ts'

// Builds the Express app without binding a port, so tests can drive it
// with Supertest and the entrypoint can own the actual listen() call.
export function createApp(): Express {
  const app = express()

  // Liveness probe — mounted FIRST, before CORS or any other middleware.
  // It must stay unauthenticated and must never touch the database: it only
  // proves this process itself is up. If it depended on Mongo, a DB blip would
  // make the platform kill a perfectly healthy process.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // Readiness probe — separate from liveness on purpose. This is where DB
  // state is reported (plan 004, Open Question 1). It reads Mongoose's
  // in-memory readyState only, so it still issues no database query.
  // 200 when the DB is usable, 503 when it isn't, so a load balancer can pull
  // this instance out of rotation without the process being restarted.
  app.get('/health/ready', (_req, res) => {
    const connected = isDbConnected()
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'degraded',
      db: getDbStatus(),
    })
  })

  // Only the configured frontend origin may call this service from a browser.
  app.use(cors({ origin: config.frontendOrigin, credentials: true }))
  app.use(express.json())

  // Public, unauthenticated Service list (PRD F1 / SERVICEL-APT), plus the
  // Admin Service writes (PRD F6-F8 / ADMINDAS-APT). The Admin routes carry no
  // auth check in this service: api-gateway verifies the Admin JWT and only
  // then forwards them, so this port must not be publicly exposed.
  app.use('/api/services', serviceRouter)

  // Public, unauthenticated TimeSlot availability + atomic hold
  // (PRD F2/F3/F3b, TIMESLOT-APT).
  app.use('/api/time-slots', timeSlotRouter)

  // Public, unauthenticated Appointment creation — the second half of the
  // hold -> book lifecycle (PRD F4/F4b, CUSTOMER-APT).
  app.use('/api/appointments', appointmentRouter)

  // NOTE: the Admin Appointment management routes (F9-F11) are intentionally
  // NOT part of this ticket — they land in their own. So an Appointment can
  // only ever be created `pending` here; nothing yet moves it to `confirmed`
  // or `cancelled`.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  return app
}
