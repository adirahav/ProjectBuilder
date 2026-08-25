import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Security tests for GATEWAYL-SEC (Plan 006 — Gateway login screen, admin
 * login modal, POST /api/auth/login).
 *
 * At review time `backend/user-management-service/` (the login route,
 * password hashing, JWT signing, role check) has NOT been implemented yet —
 * only the frontend half of plan 006 exists. These tests therefore:
 *  1. Statically audit the frontend source for the security properties the
 *     plan requires (generic error handling, no credential logging, token
 *     handled only through the storage abstraction, withAuth:false on the
 *     unauthenticated login/signup calls).
 *  2. Assert (and fail loudly) that the backend login endpoint is still
 *     missing, so this test suite forces a re-audit once it lands — the most
 *     important checks (bcrypt/argon2 hashing, `roles` includes `admin`
 *     enforcement, generic 401 for every failure mode, rate limiting/lockout,
 *     JWT secret + expiry) can only be verified against real backend code.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

describe('GATEWAYL-SEC: backend login endpoint (expected gap)', () => {
  it('flags that backend/user-management-service does not exist yet', () => {
    const backendExists = existsSync(resolve(root, 'backend/user-management-service/src'))
    // This is intentionally an assertion, not a soft warning: it must fail
    // (and be revisited) once the backend is implemented, at which point this
    // whole describe block should be replaced by real backend security tests
    // (role check, hashing, generic error, rate limiting).
    expect(backendExists).toBe(false)
  })
})

describe('GATEWAYL-SEC: frontend login payload handling', () => {
  const authService = read('frontend/src/services/auth.service.ts')

  it('never logs the password field', () => {
    // The whole file's console.log calls must not reference `values.password`,
    // `payload.password`, or a bare `password` identifier being interpolated.
    const consoleLines = authService
      .split('\n')
      .filter((line) => line.includes('console.log'))
    for (const line of consoleLines) {
      expect(line.toLowerCase()).not.toContain('password')
    }
  })

  it('sends the login request with withAuth: false (no stale bearer token leaked to an unauthenticated endpoint)', () => {
    const loginFn = authService.slice(
      authService.indexOf('async function login'),
      authService.indexOf('async function logout'),
    )
    expect(loginFn).toMatch(/withAuth:\s*false/)
  })

  it('routes the token through the storage abstraction, never touches localStorage directly', () => {
    expect(authService).not.toMatch(/localStorage/)
    expect(authService).toMatch(/setAuthToken/)
  })

  it('normalizes email (trim/lowercase) before sending, reducing case-based account-enumeration mismatches', () => {
    const loginFn = authService.slice(
      authService.indexOf('async function login'),
      authService.indexOf('async function logout'),
    )
    expect(loginFn).toMatch(/\.trim\(\)/)
    expect(loginFn).toMatch(/\.toLowerCase\(\)/)
  })
})

describe('GATEWAYL-SEC: admin login modal error handling', () => {
  const modal = read('frontend/src/components/auth/AdminLoginModal.tsx')

  it('uses one generic, undifferentiated message for every credential failure (401/400) — no account-enumeration hints', () => {
    const catchBlock = modal.slice(modal.indexOf('} catch (err) {'), modal.indexOf('} finally {'))
    // Only one distinct user-facing string literal should be attributable to
    // the 401/400 branch, and it must be the shared constant, not a bespoke
    // "email not found" / "not an admin" string.
    expect(catchBlock).toMatch(/INVALID_CREDENTIALS_MESSAGE/)
    expect(catchBlock).not.toMatch(/לא נמצא|not.*admin|not.*found/i)
  })

  it('never logs the submitted email or password on failure, only the HTTP status/error name', () => {
    const catchBlock = modal.slice(modal.indexOf('} catch (err) {'), modal.indexOf('} finally {'))
    expect(catchBlock).not.toMatch(/values\.email/)
    expect(catchBlock).not.toMatch(/values\.password/)
  })

  it('clears the password from component state after a successful login', () => {
    const tryBlock = modal.slice(modal.indexOf('try {'), modal.indexOf('} catch (err) {'))
    expect(tryBlock).toMatch(/setValues\(EMPTY_FORM\)/)
  })

  it('password field uses autoComplete="current-password" and a real password input type (not exposed as plain text by default)', () => {
    const passwordFieldBlock = modal.slice(
      modal.indexOf('id="login-password"'),
      modal.indexOf('endSlot='),
    )
    expect(passwordFieldBlock).toMatch(/autoComplete="current-password"/)
    expect(passwordFieldBlock).toMatch(/isPasswordVisible \? 'text' : 'password'/)
  })

  it('does not close the modal or navigate away on failed submit (formError is set in the same handler, no onClose/onSuccess call in the catch branch)', () => {
    const catchBlock = modal.slice(modal.indexOf('} catch (err) {'), modal.indexOf('} finally {'))
    expect(catchBlock).not.toMatch(/onSuccess\(\)/)
    expect(catchBlock).not.toMatch(/onClose\(\)/)
    expect(catchBlock).not.toMatch(/resetAndClose\(\)/)
  })
})

describe('GATEWAYL-SEC: token storage (XSS exposure surface)', () => {
  const util = read('frontend/src/services/util.service.ts')

  it('token storage falls back to localStorage on web (documented XSS trade-off, not httpOnly cookie)', () => {
    // This assertion documents the current state rather than approving it —
    // see the security report for the accepted-risk writeup. If this ever
    // moves to an httpOnly-cookie model, this test should be updated to
    // assert localStorage is NOT used for the token.
    expect(util).toMatch(/localStorage/)
    expect(util).toMatch(/AUTH_TOKEN_KEY/)
  })

  it('the auth token key is namespaced (not a generic "token" key that could collide/be guessed)', () => {
    expect(util).toMatch(/AUTH_TOKEN_KEY\s*=\s*'[a-z0-9.]+\.auth\.token'/)
  })
})

describe('GATEWAYL-SEC: role-derivation trust boundary', () => {
  const utils = read('frontend/src/utils/auth.utils.ts')
  const slice = read('frontend/src/store/slices/auth.slice.ts')

  it('isAdmin is derived only from server-returned roles, not settable independently', () => {
    expect(utils).toMatch(/export function isAdmin\(roles: Role\[\] \| undefined\): boolean/)
  })

  it('the auth slice only sets isAdminSession via isAdmin(user.roles) from the login/signup response, never a literal true', () => {
    expect(slice).toMatch(/isAdminSession:\s*isAdmin\(user\.roles\)/)
    expect(slice).not.toMatch(/isAdminSession:\s*true/)
  })
})
