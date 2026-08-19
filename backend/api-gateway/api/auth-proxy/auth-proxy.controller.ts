import type { Request, Response } from 'express'

import { forwardLogin, UpstreamUnavailableError } from './auth-proxy.service.ts'

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
