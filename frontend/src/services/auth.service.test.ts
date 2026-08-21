import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authService,
  isDuplicateEmailError,
  isInvalidCredentialsError,
  LOGIN_ENDPOINT,
  REGISTER_ENDPOINT,
} from './auth.service'
import { gatewayHttpService } from './http.service'
import { buildLoginResponse, buildRegisterResponse } from '../test/factories'
import type { AdminCredentials, StaffAccountDraft } from '../types/auth.types'

vi.mock('./http.service', () => ({
  LOGIN_ENDPOINT: '/api/auth/login',
  gatewayHttpService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  saveToken: vi.fn(),
  readToken: vi.fn(),
  removeToken: vi.fn(),
}))

const mockedPost = vi.mocked(gatewayHttpService.post)

const credentials: AdminCredentials = {
  identifier: 'admin@example.com',
  password: 'a-password',
}

const draft: StaffAccountDraft = {
  name: 'Dana Levi',
  email: 'dana@example.com',
  password: 'a-good-password',
}

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'Invalid credentials' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the credentials to the gateway and returns the issued session', async () => {
    const response = buildLoginResponse()
    mockedPost.mockResolvedValue(response)

    await expect(authService.login(credentials)).resolves.toEqual(response)
    expect(mockedPost).toHaveBeenCalledWith(LOGIN_ENDPOINT, credentials)
  })

  it('goes through api-gateway, never straight to user-service', async () => {
    mockedPost.mockResolvedValue(buildLoginResponse())

    await authService.login(credentials)

    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedPost.mock.calls[0][0]).toBe('/api/auth/login')
  })

  it('trims the identifier but sends the password exactly as typed', async () => {
    mockedPost.mockResolvedValue(buildLoginResponse())

    await authService.login({ identifier: '  admin@example.com ', password: ' secret ' })

    expect(mockedPost.mock.calls[0][1]).toEqual({
      identifier: 'admin@example.com',
      password: ' secret ',
    })
  })

  it('refuses to send an incomplete login instead of letting the gateway answer 400', async () => {
    await expect(authService.login({ ...credentials, password: '' })).rejects.toThrow()

    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('propagates a rejected login for the caller to explain', async () => {
    mockedPost.mockRejectedValue(buildErrorWithStatus(401))

    await expect(authService.login(credentials)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('authService.registerAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the new account to the gateway and returns what was created', async () => {
    const response = buildRegisterResponse()
    mockedPost.mockResolvedValue(response)

    await expect(authService.registerAdmin(draft)).resolves.toEqual(response)
    expect(mockedPost).toHaveBeenCalledWith(REGISTER_ENDPOINT, draft)
  })

  it('goes through api-gateway, never straight to user-service', async () => {
    mockedPost.mockResolvedValue(buildRegisterResponse())

    await authService.registerAdmin(draft)

    expect(mockedPost.mock.calls[0][0]).toBe('/api/auth/register')
  })

  it('uses a different endpoint from login, so the gateway can gate it separately', () => {
    // If these two ever collapse to one path, the gateway loses its ability to
    // keep login public while keeping account creation authenticated — which is
    // the whole security story of this feature.
    expect(REGISTER_ENDPOINT).not.toBe(LOGIN_ENDPOINT)
  })

  it('trims and lower-cases the email so capitalisation cannot create a duplicate', async () => {
    mockedPost.mockResolvedValue(buildRegisterResponse())

    await authService.registerAdmin({ ...draft, email: '  Dana@Example.COM ' })

    expect(mockedPost.mock.calls[0][1]).toMatchObject({ email: 'dana@example.com' })
  })

  it('sends the password exactly as typed', async () => {
    mockedPost.mockResolvedValue(buildRegisterResponse())

    await authService.registerAdmin({ ...draft, password: ' a spaced password ' })

    expect(mockedPost.mock.calls[0][1]).toMatchObject({ password: ' a spaced password ' })
  })

  it('refuses to send an invalid account instead of letting the gateway answer 400', async () => {
    await expect(authService.registerAdmin({ ...draft, email: 'not-an-email' })).rejects.toThrow()

    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('refuses to send a password below the minimum length', async () => {
    await expect(authService.registerAdmin({ ...draft, password: 'short' })).rejects.toThrow()

    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('propagates a duplicate-email rejection for the caller to explain', async () => {
    mockedPost.mockRejectedValue(buildErrorWithStatus(409))

    await expect(authService.registerAdmin(draft)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('isDuplicateEmailError', () => {
  it('recognises the 409 that means the address is already taken', () => {
    expect(isDuplicateEmailError(buildErrorWithStatus(409))).toBe(true)
  })

  it.each([400, 401, 403, 404, 500])('does not treat %i as a duplicate email', (status) => {
    expect(isDuplicateEmailError(buildErrorWithStatus(status))).toBe(false)
  })

  it('does not mistake an expired session for a duplicate email', () => {
    // A 401 here means the creating Admin's own session ran out — the global
    // handler must own that, not this form.
    expect(isDuplicateEmailError(buildErrorWithStatus(401))).toBe(false)
  })

  it('does not treat a plain network failure as a duplicate email', () => {
    expect(isDuplicateEmailError(new Error('Network Error'))).toBe(false)
  })
})

describe('isInvalidCredentialsError', () => {
  it('recognises the 401 that means the credentials were rejected', () => {
    expect(isInvalidCredentialsError(buildErrorWithStatus(401))).toBe(true)
  })

  it.each([400, 403, 404, 500, 503])('does not treat %i as a rejected login', (status) => {
    expect(isInvalidCredentialsError(buildErrorWithStatus(status))).toBe(false)
  })

  it('does not treat a plain network failure as a rejected login', () => {
    // A gateway that is down says nothing about whether the password was right.
    expect(isInvalidCredentialsError(new Error('Network Error'))).toBe(false)
  })
})
