import type { Request, Response } from 'express'

import { login, InvalidCredentialsError, ValidationError } from './auth.service.ts'
import { JwtConfigError } from '../lib/jwt.ts'

/**
 * POST /api/auth/login — request/response shape only, no business logic.
 * Status mapping per docs/api-contract/api-contract.api-gateway.yaml:
 *   400 — missing/malformed identifier or password (no credential check ran)
 *   401 — credentials rejected (unknown account OR wrong password, identical)
 *   500 — unexpected server-side failure
 */
export async function loginAdmin(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = (req.body ?? {}) as Record<string, unknown>

    const result = await login({ identifier, password })

    res.status(200).json(result)
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message })
      return
    }

    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // A misconfigured signing secret is an operator problem, not a credential
    // problem — never report it as a 401, which would send the Admin chasing
    // their password instead of the deploy config. The secret itself is never
    // echoed into the response body.
    if (err instanceof JwtConfigError) {
      console.error('[AUTH] JWT_SECRET is not configured; cannot issue tokens')
      res.status(500).json({ error: 'Server configuration error' })
      return
    }

    // Log internally, return a clean shape — never a stack trace or a raw
    // Mongoose error object, and never anything derived from the password.
    console.error('[AUTH] login failed unexpectedly:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
