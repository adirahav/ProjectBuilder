import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ConflictError, NetworkError, httpService } from './http.service'
import { getAuthToken, setAuthToken } from './util.service'

/**
 * Boundary tests for the central HTTP layer: base-URL resolution from env, auth
 * header attachment, 401 session expiry, and 409 conflict classification.
 *
 * `fetch` is stubbed — no test ever reaches a real service
 * (.rule/testing-rules.md).
 */

const USER_BASE_URL = 'http://localhost:4002'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let assignMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('VITE_USER_SERVICE_BASE_URL', USER_BASE_URL)

  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  assignMock = vi.fn()
  vi.stubGlobal('location', { pathname: '/signup', assign: assignMock })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('base URL resolution', () => {
  it('builds the request URL from the service env var, never a hardcoded host', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await httpService.get('/api/auth/me', { service: 'user-management-service' })

    expect(fetchMock.mock.calls[0][0]).toBe(`${USER_BASE_URL}/api/auth/me`)
  })

  it('appends query params and omits undefined values', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await httpService.get('/api/admins', {
      service: 'user-management-service',
      params: { page: 2, search: undefined },
    })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.has('search')).toBe(false)
  })

  it('throws a descriptive error when the base URL env var is missing', async () => {
    vi.stubEnv('VITE_USER_SERVICE_BASE_URL', '')

    await expect(
      httpService.get('/api/auth/me', { service: 'user-management-service' }),
    ).rejects.toThrow(/Missing base URL env var/)
  })
})

describe('auth header', () => {
  it('attaches the stored bearer token by default', async () => {
    await setAuthToken('test.jwt.token')
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await httpService.get('/api/auth/me', { service: 'user-management-service' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test.jwt.token')
  })

  it('omits the bearer token when withAuth is false (signup/login)', async () => {
    await setAuthToken('test.jwt.token')
    fetchMock.mockResolvedValue(jsonResponse(201, {}))

    await httpService.post('/api/auth/signup', {}, {
      service: 'user-management-service',
      withAuth: false,
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})

describe('error classification', () => {
  it('clears the token and redirects to login on 401', async () => {
    await setAuthToken('test.jwt.token')
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'expired' }))

    await expect(
      httpService.get('/api/admins', { service: 'user-management-service' }),
    ).rejects.toBeInstanceOf(ApiError)

    await expect(getAuthToken()).resolves.toBeNull()
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('throws a ConflictError, not a generic ApiError, on 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { message: 'Email already registered', code: 'EMAIL_TAKEN' }),
    )

    const error = await httpService
      .post('/api/auth/signup', {}, { service: 'user-management-service', withAuth: false })
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ConflictError)
    expect((error as ConflictError).status).toBe(409)
    expect((error as ConflictError).code).toBe('EMAIL_TAKEN')
  })

  it('throws a generic ApiError carrying the server status on other failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'Invalid payload' }))

    const error = await httpService
      .post('/api/auth/signup', {}, { service: 'user-management-service', withAuth: false })
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
  })

  it('throws a NetworkError when the request never reaches the server', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      httpService.get('/api/admins', { service: 'user-management-service' }),
    ).rejects.toBeInstanceOf(NetworkError)
  })
})
