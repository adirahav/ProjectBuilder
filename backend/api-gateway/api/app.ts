import express, { type Express } from 'express'
import cors from 'cors'

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

  // NOTE: JWT verification middleware and the reverse-proxy routes to
  // user-service / booking-service / notification-service are intentionally
  // NOT part of this scaffold ticket (SCAFFOLD-GW). They land in the
  // follow-up JWT-middleware and routing tickets. Until then this gateway
  // gates nothing and must not be treated as an enforced auth boundary.

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  return app
}
