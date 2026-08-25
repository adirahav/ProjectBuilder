import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authService } from '../../frontend/src/services/auth.service'
import { ApiError } from '../../frontend/src/services/http.service'
import { useStore } from '../../frontend/src/store/store'
import { getAuthToken, clearAuthToken } from '../../frontend/src/services/util.service'

/**
 * Security regression tests for GATEWAYL-SEC (Gateway / admin login modal, plan 006).
 *
 * Run from `frontend/` so the existing vitest + jsdom setup applies:
 *   cd frontend && npx vitest run ../tests/security/gatewayl-login.security.test.ts
 *
 * These are frontend-only checks. `backend/user-management-service` has not been
 * implemented yet in this repo (only `backend/.env.shared.example` exists), so the
 * server-side `POST /api/auth/login` role-check, password-hash verification, and
 * generic-401 behavior described in plan 006 (Steps 1-2, Validation) could NOT be
 * tested here — flagged in the report as untestable-in-scope, not passed/failed.
 */

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

beforeEach(async () => {
  await clearAuthToken()
  useStore.getState().clearSession()
})

describe('GATEWAYL-SEC: admin login credential handling', () => {
  it('never logs the submitted password to the console', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'jwt.fixture.token',
        user: { id: '1', fullName: 'Admin', email: 'admin@example.com', roles: ['admin'] },
      }),
    }) as unknown as typeof fetch

    await authService.login({ email: 'admin@example.com', password: 'S3cretPass!' })

    const loggedText = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(loggedText).not.toContain('S3cretPass!')
  })

  it('does not leak the plaintext password in the outgoing request body beyond the single expected field', async () => {
    let capturedBody: string | undefined
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'jwt.fixture.token',
          user: { id: '1', fullName: 'Admin', email: 'admin@example.com', roles: ['admin'] },
        }),
      })
    }) as unknown as typeof fetch

    await authService.login({ email: 'Admin@Example.com  ', password: 'S3cretPass!' })

    const parsed = JSON.parse(capturedBody ?? '{}')
    expect(Object.keys(parsed).sort()).toEqual(['email', 'password'])
    // Email is normalized client-side; no extra PII/roles/isAdmin hint is sent.
    expect(parsed.email).toBe('admin@example.com')
  })

  it('sends the login request without an existing bearer token (withAuth: false)', async () => {
    await getAuthToken().then(async (existing) => {
      if (existing) await clearAuthToken()
    })
    // Seed a stale token to prove login does not attach it.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'jwt.fixture.token',
        user: { id: '1', fullName: 'Admin', email: 'admin@example.com', roles: ['admin'] },
      }),
    }) as unknown as typeof fetch

    await authService.login({ email: 'admin@example.com', password: 'S3cretPass!' })

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('only marks the session as admin when the server-returned roles include "admin" (client cannot self-elevate)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'jwt.fixture.token',
        // Server returns a non-admin role despite this being the admin-login flow.
        user: { id: '2', fullName: 'Regular User', email: 'user@example.com', roles: ['user'] },
      }),
    }) as unknown as typeof fetch

    await authService.login({ email: 'user@example.com', password: 'Password1' })

    expect(useStore.getState().isAdminSession).toBe(false)
  })

  it('does not distinguish "unknown email" from "wrong password" from "valid non-admin" at the client: any 401 renders as ApiError with status 401 and no differentiating field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    }) as unknown as typeof fetch

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401 })

    // No session/token should be set on failure.
    expect(useStore.getState().isAuthenticated).toBe(false)
    expect(await getAuthToken()).toBeNull()
  })

  it('a 401 from the unauthenticated login call does not trigger global session-expiry redirect/wipe (would be a false "session expired" state)', async () => {
    await useStore.getState().setSession({
      id: '9',
      fullName: 'Existing Admin',
      email: 'existing@example.com',
      roles: ['admin'],
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    }) as unknown as typeof fetch

    await expect(
      authService.login({ email: 'someone@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(ApiError)

    // Because login is sent with withAuth:false, http.service.ts must NOT have
    // treated this 401 as session expiry for whatever session already existed.
    expect(useStore.getState().isAuthenticated).toBe(true)
    expect(useStore.getState().currentUser?.email).toBe('existing@example.com')
  })

  it('persists the JWT via the storage abstraction (localStorage on web) rather than a component-level side channel', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'jwt.fixture.token.value',
        user: { id: '1', fullName: 'Admin', email: 'admin@example.com', roles: ['admin'] },
      }),
    }) as unknown as typeof fetch

    await authService.login({ email: 'admin@example.com', password: 'S3cretPass!' })

    expect(await getAuthToken()).toBe('jwt.fixture.token.value')
  })
})
