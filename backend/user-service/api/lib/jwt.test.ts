import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'

import { signAuthToken, JwtConfigError } from './jwt.ts'
import { config } from './config.ts'

const TEST_SECRET = 'test-secret-not-a-real-credential'
const originalSecret = config.jwtSecret
const originalExpiry = config.jwtExpiresIn

beforeEach(() => {
  config.jwtSecret = TEST_SECRET
  config.jwtExpiresIn = '24h'
})

afterEach(() => {
  config.jwtSecret = originalSecret
  config.jwtExpiresIn = originalExpiry
})

describe('signAuthToken', () => {
  it('signs a verifiable token with the configured secret', () => {
    const token = signAuthToken({ userId: 'admin-uuid', roles: ['admin'] })

    const decoded = jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] }) as Record<
      string,
      unknown
    >

    expect(decoded.userId).toBe('admin-uuid')
    expect(decoded.roles).toEqual(['admin'])
  })

  it('pins HS256 in the header rather than leaving it to library defaults', () => {
    // Algorithm confusion / `alg: none` is only closed if the algorithm is
    // pinned on BOTH sign and verify. This asserts the signing half.
    const token = signAuthToken({ userId: 'admin-uuid', roles: ['admin'] })

    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    expect(header.alg).toBe('HS256')
  })

  it('sets a bounded expiry from configuration', () => {
    const token = signAuthToken({ userId: 'admin-uuid', roles: ['admin'] })

    const decoded = jwt.decode(token) as Record<string, number>

    expect(decoded.exp).toBeDefined()
    // 24h, allowing a couple of seconds of clock slack during the test run.
    expect(decoded.exp - decoded.iat).toBeCloseTo(24 * 60 * 60, -1)
  })

  it('does not fail open when JWT_SECRET is blank', () => {
    // Signing with an empty secret would mint forgeable tokens. Throwing is
    // the only safe behavior — the controller maps this to a 500, not a 401.
    config.jwtSecret = ''

    expect(() => signAuthToken({ userId: 'admin-uuid', roles: ['admin'] })).toThrow(
      JwtConfigError,
    )
  })

  it('is rejected by verification under a different secret', () => {
    const token = signAuthToken({ userId: 'admin-uuid', roles: ['admin'] })

    expect(() => jwt.verify(token, 'a-different-secret', { algorithms: ['HS256'] })).toThrow()
  })

  it('carries no sensitive fields in the payload', () => {
    // JWTs are signed, not encrypted — anyone can base64-decode the payload.
    const token = signAuthToken({ userId: 'admin-uuid', roles: ['admin'] })

    const payload = jwt.decode(token) as Record<string, unknown>

    expect(payload.passwordHash).toBeUndefined()
    expect(payload.password).toBeUndefined()
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'roles', 'userId'])
  })
})
