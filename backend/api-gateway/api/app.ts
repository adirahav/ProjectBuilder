import express, { type Express } from 'express'
import cors from 'cors'

import { authProxyRouter } from './auth-proxy/auth-proxy.routes.ts'
import { config } from './lib/config.ts'
import { verifyJwt } from './routing/routing.middleware.ts'
import { serviceProxyRouter } from './service-proxy/service-proxy.routes.ts'

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

  // PRD F6-F8 (ADMINDAS-GW), Screen 6. The Admin Service management routes,
  // gated at the MOUNT POINT so every route in the router — including any added
  // later — is behind the JWT check by default. verifyJwt also strips any
  // client-supplied `x-internal-admin` before booking-service ever sees it.
  //
  // The public GET /api/services is NOT served here — the frontend calls
  // booking-service directly for it. Because the guard sits at the mount point,
  // an unauthenticated GET /api/services against the GATEWAY answers 401 rather
  // than 404. That is intentional (fail closed): the gateway never serves the
  // public list, and the public list is unaffected because it never comes here.
  app.use('/api/services', verifyJwt, serviceProxyRouter)

  // NOTE: the Admin Appointment routes (F9-F11) land with Screen 7 and must
  // likewise be mounted behind `verifyJwt`. The reverse-proxy routes to
  // notification-service are still out of scope.

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  return app
}
