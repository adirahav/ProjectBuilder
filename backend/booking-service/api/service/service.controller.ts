import type { Request, Response } from 'express'

import { isDbConnected } from '../lib/db.ts'
import { listActiveServices } from './service.service.ts'

/**
 * GET /api/services — public, unauthenticated (PRD: all public booking routes
 * are unauthenticated). Request/response shape only; all logic lives in the
 * service layer.
 *
 * Any query string the client sends is ignored outright — `req.query` is never
 * read here, per the contract.
 */
export async function getServices(_req: Request, res: Response): Promise<void> {
  // A DB that is not connected is a 503 (transient, retryable) rather than a
  // 500, so the frontend can distinguish "come back later" from a real bug.
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  try {
    const services = await listActiveServices()
    res.status(200).json(services)
  } catch (err) {
    // Never leak a stack trace or a raw Mongoose error to the client — the
    // detail goes to the logs, the client gets the uniform error envelope.
    console.error('booking-service: GET /api/services failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
