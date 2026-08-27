import jwt, { type SignOptions } from 'jsonwebtoken'
import { config } from './config.js'

export type AdminRole = 'admin' | 'user'

export type TokenPayload = {
  /** The account's `uuid` — never Mongo's `_id` (.rule/database-rules.md). */
  sub: string
  email: string
  roles: AdminRole[]
}

/**
 * user-management-service is the ONLY issuer of tokens in this project.
 * tour-service verifies them independently — there is no gateway and no
 * callback between the services — so both share a byte-identical `JWT_SECRET`.
 *
 * `algorithm`/`algorithms` are pinned to HS256 explicitly so a token with
 * `alg: none` (or any asymmetric algorithm) can never be minted or accepted.
 */
export function signToken(payload: TokenPayload): string {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured')
  }
  const options = {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  } as SignOptions
  return jwt.sign(payload, config.jwtSecret, options)
}

export function verifyToken(token: string): TokenPayload {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured')
  }
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload
}
