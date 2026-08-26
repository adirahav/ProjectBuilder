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
 * tour-service verifies JWTs independently — there is no gateway centralizing
 * auth and no callback to user-management-service to validate a token. Both
 * services share the identical `JWT_SECRET`.
 *
 * **No route in the current API contract uses this middleware.** Every
 * passenger endpoint is deliberately public (PRD: the passenger flow has "no
 * auth step"). It is here for the admin seat actions and Tour/Bus/BusType CRUD
 * that land in later tickets — those MUST be gated with `requireAdmin` and MUST
 * NOT reuse the public passenger paths.
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
