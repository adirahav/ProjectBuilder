import express, { type Express } from 'express'
import cors from 'cors'

import { authProxyRouter } from './auth-proxy/auth-proxy.routes.ts'
import { config } from './lib/config.ts'

// Builds the Express app without binding a port, so tests can drive it
// with Supertest and the entrypoint can own the actual listen() call.
export function createApp(): Express {
  const app = express()

  // Liveness probe — mounted FIRST, before CORS, auth, or any proxy route.
  // It must stay unauthenticated, must never touch a database, and must never
  // be forwarded upstream: it only proves this process itself is up.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // Only the configured frontend origin may call the gateway from a browser.
  app.use(cors({ origin: config.frontendOrigin, credentials: true }))
  app.use(express.json())

  // PRD F5 (ADMINLOG-GW). The login proxy is mounted WITHOUT verifyJwt — it is
  // how a token is obtained in the first place.
  app.use('/api/auth', authProxyRouter)

  // NOTE: `verifyJwt` (api/routing/routing.middleware.ts) is implemented and
  // exported ready to gate Admin routes, but no Admin business route exists
  // yet — the Service writes (F6-F8) and Appointment routes (F9-F11) land with
  // Screens 6-7 and must each be mounted behind it. The reverse-proxy routes to
  // booking-service / notification-service are likewise still out of scope.

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  return app
}
