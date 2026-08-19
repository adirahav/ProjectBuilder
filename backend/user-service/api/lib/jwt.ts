import jwt from 'jsonwebtoken'

import { config } from './config.ts'

// user-service is the ONLY service that signs a token; api-gateway is the only
// one that verifies it (see jwt-middleware-layer). There is deliberately no
// verify helper in this file — adding one here would blur that trust boundary.
export interface AuthTokenPayload {
  userId: string
  roles: string[]
}

/**
 * Thrown when JWT_SECRET is absent/blank. Signing with an empty secret would
 * produce tokens anyone could forge, so this fails loudly rather than
 * degrading silently into an insecure-but-working login.
 */
export class JwtConfigError extends Error {
  constructor() {
    super('JWT_SECRET is not configured')
    this.name = 'JwtConfigError'
  }
}

export function signAuthToken(payload: AuthTokenPayload): string {
  if (!config.jwtSecret) {
    throw new JwtConfigError()
  }

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    // Pinned explicitly on both sign and verify: leaving the algorithm to the
    // library default is the classic `alg: none` / algorithm-confusion hole.
    algorithm: 'HS256',
  } as jwt.SignOptions)
}
