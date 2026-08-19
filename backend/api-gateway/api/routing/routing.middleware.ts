import type { NextFunction, Request, Response } from 'express'

import { type AdminClaims, JwtVerificationError, verifyAdminToken } from '../lib/jwt.ts'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminClaims
    }
  }
}

// The single security boundary for every Admin route. Rejects a missing,
// malformed or expired `Authorization: Bearer <token>` with 401 BEFORE the
// request is ever forwarded upstream.
//
// No Admin business route exists yet (Screens 6-7 add them) — this is exported
// ready to gate them, and is deliberately NOT applied to POST /api/auth/login,
// which is how the token is obtained in the first place.
export function verifyJwt(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    req.admin = verifyAdminToken(token)
  } catch (error) {
    if (error instanceof JwtVerificationError) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    throw error
  }

  // Downstream services trust this header instead of re-verifying the JWT.
  // Strip any client-supplied value first so it can never be spoofed.
  req.headers['x-internal-admin'] = req.admin.sub

  next()
}
