import jwt from 'jsonwebtoken'
import { config } from './config.js'

export type AdminRole = 'admin' | 'user'

export type TokenPayload = {
  sub: string
  username: string
  roles: AdminRole[]
}

/**
 * tour-service verifies JWTs independently — there is no gateway and no
 * callback to user-management-service to validate a token. Both services share
 * the identical JWT_SECRET. `algorithms` is pinned explicitly so a token with
 * `alg: none` (or any asymmetric algorithm) can never be accepted.
 *
 * No endpoint in the current API contract uses this — the whole passenger flow
 * is public — it exists for the admin seat-action routes that land later.
 */
export function verifyToken(token: string): TokenPayload {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured')
  }
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload
}
