import jwt, { type JwtPayload } from 'jsonwebtoken'

import { config } from './config.ts'

// api-gateway only ever VERIFIES tokens — user-service is the sole issuer.
// The secret must be byte-identical across both services.

export type AdminClaims = {
  sub: string
  role: 'admin'
  email?: string
  iat?: number
  exp?: number
}

export class JwtVerificationError extends Error {}

export function verifyAdminToken(token: string): AdminClaims {
  if (!config.jwtSecret) {
    // Fail closed: an unset secret must never be treated as "anything verifies".
    throw new JwtVerificationError('JWT_SECRET is not configured')
  }

  let decoded: string | JwtPayload
  try {
    decoded = jwt.verify(token, config.jwtSecret)
  } catch {
    // Deliberately opaque: expired, malformed and wrong-signature all look alike.
    throw new JwtVerificationError('Invalid token')
  }

  if (typeof decoded === 'string' || !decoded.sub || decoded.role !== 'admin') {
    throw new JwtVerificationError('Invalid token')
  }

  return {
    sub: String(decoded.sub),
    role: 'admin',
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
    iat: decoded.iat,
    exp: decoded.exp,
  }
}
