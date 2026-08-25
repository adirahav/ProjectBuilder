import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authService } from './auth.service'
import { ApiError, ConflictError, httpService } from './http.service'
import { getAuthToken } from './util.service'
import { useStore } from '../store/store'
import type { SignupResponse } from '../types/auth.types'

/**
 * Service-layer tests for the auth domain.
 *
 * `http.service.ts` is mocked rather than hitting a real API
 * (.rule/testing-rules.md), so these assert the service's own behavior: payload
 * normalization, token persistence, and store updates.
 */

vi.mock('./http.service', async () => {
  const actual = await vi.importActual<typeof import('./http.service')>('./http.service')
  return { ...actual, httpService: { ...actual.httpService, post: vi.fn() } }
})

const postMock = vi.mocked(httpService.post)

function buildSignupResponse(overrides: Partial<SignupResponse['user']> = {}): SignupResponse {
  return {
    token: 'test.jwt.token',
    user: {
      id: 'u1',
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      roles: ['user'],
      ...overrides,
    },
  }
}

describe('authService.signup', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  it('posts to the user-management-service signup route without an auth header', async () => {
    postMock.mockResolvedValue(buildSignupResponse())

    await authService.signup({
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      password: 'Aegean2026',
    })

    expect(postMock).toHaveBeenCalledWith(
      '/api/auth/signup',
      expect.any(Object),
      { service: 'user-management-service', withAuth: false },
    )
  })

  it('trims the full name and lower-cases the email before sending', async () => {
    postMock.mockResolvedValue(buildSignupResponse())

    await authService.signup({
      fullName: '  הילה כהן  ',
      email: '  Hila@Example.COM ',
      password: 'Aegean2026',
    })

    expect(postMock.mock.calls[0][1]).toEqual({
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      password: 'Aegean2026',
    })
  })

  it('never sends a roles or isAdmin field the server could act on', async () => {
    postMock.mockResolvedValue(buildSignupResponse())

    await authService.signup({
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      password: 'Aegean2026',
    })

    expect(Object.keys(postMock.mock.calls[0][1] as object).sort()).toEqual([
      'email',
      'fullName',
      'password',
    ])
  })

  it('persists the token and sets the session from the server response', async () => {
    postMock.mockResolvedValue(buildSignupResponse())

    await authService.signup({
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      password: 'Aegean2026',
    })

    await expect(getAuthToken()).resolves.toBe('test.jwt.token')
    expect(useStore.getState().currentUser?.roles).toEqual(['user'])
    expect(useStore.getState().isAuthenticated).toBe(true)
  })

  it('propagates a duplicate-email conflict without touching auth state', async () => {
    postMock.mockRejectedValue(new ConflictError('Email already registered', 'EMAIL_TAKEN'))

    await expect(
      authService.signup({
        fullName: 'הילה כהן',
        email: 'hila@example.com',
        password: 'Aegean2026',
      }),
    ).rejects.toBeInstanceOf(ConflictError)

    await expect(getAuthToken()).resolves.toBeNull()
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('propagates a validation error from the server', async () => {
    postMock.mockRejectedValue(new ApiError(400, 'Invalid payload'))

    await expect(
      authService.signup({ fullName: 'ה', email: 'nope', password: 'short' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(useStore.getState().currentUser).toBeNull()
  })
})

describe('authService.login', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  function buildLoginResponse(): SignupResponse {
    return buildSignupResponse({ roles: ['admin'] })
  }

  it('posts to the login route without an auth header', async () => {
    postMock.mockResolvedValue(buildLoginResponse())

    await authService.login({ email: 'hila@example.com', password: 'Aegean2026' })

    expect(postMock).toHaveBeenCalledWith('/api/auth/login', expect.any(Object), {
      service: 'user-management-service',
      withAuth: false,
    })
  })

  it('normalizes the email and sends only the credential fields', async () => {
    postMock.mockResolvedValue(buildLoginResponse())

    await authService.login({ email: '  Hila@Example.COM ', password: 'Aegean2026' })

    expect(postMock.mock.calls[0][1]).toEqual({
      email: 'hila@example.com',
      password: 'Aegean2026',
    })
  })

  it('persists the token and marks the session as admin from the returned roles', async () => {
    postMock.mockResolvedValue(buildLoginResponse())

    await authService.login({ email: 'hila@example.com', password: 'Aegean2026' })

    await expect(getAuthToken()).resolves.toBe('test.jwt.token')
    expect(useStore.getState().isAuthenticated).toBe(true)
    expect(useStore.getState().isAdminSession).toBe(true)
  })

  it('does not mark the session admin when the server returns non-admin roles', async () => {
    postMock.mockResolvedValue(buildSignupResponse({ roles: ['user'] }))

    await authService.login({ email: 'hila@example.com', password: 'Aegean2026' })

    expect(useStore.getState().isAdminSession).toBe(false)
  })

  it('propagates a 401 without persisting a token or establishing a session', async () => {
    postMock.mockRejectedValue(new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS'))

    const error = await authService
      .login({ email: 'hila@example.com', password: 'wrong-password' })
      .catch((err: unknown) => err)

    expect((error as ApiError).status).toBe(401)
    await expect(getAuthToken()).resolves.toBeNull()
    expect(useStore.getState().isAuthenticated).toBe(false)
    expect(useStore.getState().currentUser).toBeNull()
  })
})

describe('authService.logout', () => {
  it('clears both the persisted token and the in-memory session', async () => {
    postMock.mockResolvedValue(buildSignupResponse())
    await authService.signup({
      fullName: 'הילה כהן',
      email: 'hila@example.com',
      password: 'Aegean2026',
    })

    await authService.logout()

    await expect(getAuthToken()).resolves.toBeNull()
    expect(useStore.getState().isAuthenticated).toBe(false)
    expect(useStore.getState().currentUser).toBeNull()
  })
})
