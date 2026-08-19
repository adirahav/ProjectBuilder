import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService, isInvalidCredentialsError, LOGIN_ENDPOINT } from './auth.service'
import { gatewayHttpService } from './http.service'
import { buildLoginResponse } from '../test/factories'
import type { AdminCredentials } from '../types/auth.types'

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
