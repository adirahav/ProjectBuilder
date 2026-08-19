import express, { type Express } from 'express'
import cors from 'cors'

import { config } from './lib/config.ts'
import { getDbStatus, isDbConnected } from './lib/db.ts'
import { authRouter } from './auth/auth.routes.ts'

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
  // state is reported (plan 005, Open Question 2). It reads Mongoose's
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

  // Admin authentication (PRD F5, ticket ADMINLOG-USR). This service is the
  // only one that SIGNS a JWT; api-gateway is the only one that verifies it.
  // Reached in production via api-gateway's proxy, which does not apply JWT
  // verification to this route — it is how the token is obtained.
  app.use('/api/auth', authRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  return app
}
