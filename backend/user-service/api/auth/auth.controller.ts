import type { Request, Response } from 'express'

import {
  login,
  createAdmin,
  InvalidCredentialsError,
  ValidationError,
  EmailTakenError,
} from './auth.service.ts'
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

/**
 * POST /api/auth/register — request/response shape only, no business logic.
 * PRD F12, Screen 8 (AC-10).
 *
 * SECURITY: this handler intentionally performs no JWT check. api-gateway
 * mounts its proxy for this route behind `verifyJwt` and answers 401 before
 * the request ever arrives here. This is the same trust boundary every other
 * non-login route uses; it holds only while user-service stays unreachable
 * from outside the internal network.
 *
 * Status mapping per docs/api-contract/api-contract.api-gateway.yaml:
 *   201 — created; public fields only, and deliberately no token
 *   400 — missing/malformed field (no existing account was consulted)
 *   409 — that email is already taken
 *   500 — unexpected server-side failure
 */
export async function registerAdmin(req: Request, res: Response): Promise<void> {
  try {
    // Only the three named fields are read — never a spread of req.body, which
    // would let a caller set `passwordHash`, `uuid` or `createdAt` directly.
    const { name, email, password } = (req.body ?? {}) as Record<string, unknown>

    const result = await createAdmin({ name, email, password })

    res.status(201).json(result)
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message })
      return
    }

    // Names the field and stops there: it must not reveal who owns the
    // existing account, whether it is active, or when it was created.
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: 'An account with that email already exists' })
      return
    }

    // The submitted password must never reach the logs, so only the error's
    // own message is logged — never the request body.
    console.error('[AUTH] register failed unexpectedly:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
