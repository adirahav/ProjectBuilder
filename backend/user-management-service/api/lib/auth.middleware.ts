import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type TokenPayload } from './jwt.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: TokenPayload
    }
  }
}

/**
 * Verifies the JWT independently — this service never assumes another service's
 * verification result and never calls out to validate a token.
 *
 * **No route in the current API contract uses this middleware.**
 * `POST /api/auth/signup` is explicitly `security: []` (public). It is here for
 * the admin-management routes that land in later tickets — notably
 * `PATCH /api/admins/:id/roles` (F2b role promotion), which MUST be gated with
 * `requireAdmin`. A signup token carries `roles: ["user"]` and therefore can
 * never pass this gate, which is the point.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required', code: 'UNAUTHORIZED' })
  }

  try {
    const payload = verifyToken(header.slice('Bearer '.length).trim())

    if (!payload.roles?.includes('admin')) {
      return res.status(403).json({ message: 'Admin role required', code: 'FORBIDDEN' })
    }

    req.admin = payload
    return next()
  } catch {
    // Never echo the token or the underlying jwt error into the response.
    return res.status(401).json({ message: 'Invalid or expired token', code: 'UNAUTHORIZED' })
  }
}
