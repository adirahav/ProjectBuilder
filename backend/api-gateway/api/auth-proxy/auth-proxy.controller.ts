import type { Request, Response } from 'express'

import { forwardLogin, forwardRegister, UpstreamUnavailableError } from './auth-proxy.service.ts'

// PRD F5. The one gateway route that is NOT behind verifyJwt.
export async function loginAdmin(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const { identifier, password } = body

  // The password is NEVER trimmed — leading/trailing spaces are legitimate
  // characters. Only the identifier is normalised.
  const normalisedIdentifier = typeof identifier === 'string' ? identifier.trim() : ''

  if (!normalisedIdentifier || typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: 'Identifier and password are required' })
    return
  }

  if (normalisedIdentifier.length > 254) {
    res.status(400).json({ error: 'Identifier and password are required' })
    return
  }

  try {
    const upstream = await forwardLogin({ identifier: normalisedIdentifier, password })

    if (upstream.status === 200) {
      res.status(200).json(upstream.body)
      return
    }

    if (upstream.status === 400) {
      res.status(400).json({ error: 'Identifier and password are required' })
      return
    }

    if (upstream.status === 401) {
      // Unknown identifier and wrong password are deliberately identical.
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Any other upstream status is an upstream failure, never a credential problem.
    res.status(502).json({ error: 'Authentication service unavailable' })
  } catch (error) {
    if (error instanceof UpstreamUnavailableError) {
      res.status(502).json({ error: 'Authentication service unavailable' })
      return
    }
    res.status(502).json({ error: 'Authentication service unavailable' })
  }
}

const REQUIRED_FIELDS_ERROR = 'Name, email and password are required'

// Deliberately conservative: one @, something either side, a dot in the domain.
// The server normalises and re-checks rather than trusting the frontend.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// bcrypt silently ignores anything past 72 BYTES (not characters), so a longer
// password would quietly not be the password the Admin thinks they set.
function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

// PRD F12, Screen 8 (AC-10). The mirror image of loginAdmin above: that route is
// public, this one is NOT. It is mounted behind verifyJwt in auth-proxy.routes.ts
// — see the comment there. There is no self-service sign-up in this product.
export async function registerAdmin(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const { name, email, password } = body

  const normalisedName = typeof name === 'string' ? name.trim() : ''
  // Lower-cased and trimmed here too, so "Dana@Example.com" and
  // "dana@example.com" cannot become two accounts even if the client skipped it.
  const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  if (!normalisedName || !normalisedEmail || typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: REQUIRED_FIELDS_ERROR })
    return
  }

  if (normalisedName.length < 2 || normalisedName.length > 60) {
    res.status(400).json({ error: 'Name must be between 2 and 60 characters' })
    return
  }

  if (normalisedEmail.length > 254 || !EMAIL_PATTERN.test(normalisedEmail)) {
    res.status(400).json({ error: 'Email must be a valid email address' })
    return
  }

  // The password is NEVER trimmed — leading/trailing spaces are legitimate
  // characters — and never logged or echoed back in any error message.
  if (byteLength(password) < 8 || byteLength(password) > 72) {
    res.status(400).json({ error: 'Password must be between 8 and 72 characters' })
    return
  }

  // verifyJwt guarantees this is set; fail closed if the guard was ever removed.
  const internalAdminId = req.admin?.sub
  if (!internalAdminId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const upstream = await forwardRegister(
      { name: normalisedName, email: normalisedEmail, password },
      internalAdminId,
    )

    if (upstream.status === 201) {
      res.status(201).json(upstream.body)
      return
    }

    if (upstream.status === 400) {
      res.status(400).json({ error: REQUIRED_FIELDS_ERROR })
      return
    }

    if (upstream.status === 409) {
      // Names the field and stops there — never who owns the existing account.
      res.status(409).json({ error: 'An account with that email already exists' })
      return
    }

    // Any other upstream status is an upstream failure, never a problem with
    // what the Admin typed.
    res.status(502).json({ error: 'Authentication service unavailable' })
  } catch (error) {
    if (error instanceof UpstreamUnavailableError) {
      res.status(502).json({ error: 'Authentication service unavailable' })
      return
    }
    res.status(502).json({ error: 'Authentication service unavailable' })
  }
}
