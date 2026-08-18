import express, { type Express } from 'express'

// Builds the Express app without binding a port, so tests can drive it with
// Supertest and the entrypoint can own the actual listen() call.
export function createApp(): Express {
  const app = express()

  // Liveness probe — mounted FIRST, before any other route or middleware.
  // It must stay unauthenticated and must never touch a database or an upstream
  // service: it only proves this process itself is up.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.use(express.json())

  // NOTE: no CORS middleware is mounted on purpose. notification-service has no
  // client-facing routes — it is called server-to-server by booking-service
  // only. With no CORS headers emitted, browsers block cross-origin calls by
  // default, which is the most restrictive posture available here. If a
  // browser-facing route is ever added, add cors({ origin: FRONTEND_ORIGIN }).

  // NOTE: the endpoint that receives booking-confirmation requests from
  // booking-service (F4b) is intentionally NOT part of this scaffold ticket
  // (SCAFFOLD-NOT), along with any email/SMS provider integration, templating,
  // and retry/queue logic.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  return app
}
