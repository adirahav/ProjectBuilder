import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { ADMIN_STORAGE_KEY } from './auth.slice'
import { authService } from '../../services/auth.service'
import { utilService } from '../../services/util.service'
import { buildLoginResponse, buildRegisterResponse } from '../../test/factories'
import type { AdminCredentials, StaffAccountDraft } from '../../types/auth.types'

vi.mock('../../services/auth.service', async () => {
  // The real 401 predicate is preserved — recognising a rejected login as
  // "wrong credentials" rather than a fault is what these tests exist to prove.
  const actual =
    await vi.importActual<typeof import('../../services/auth.service')>(
      '../../services/auth.service',
    )

  return {
    ...actual,
    authService: {
      login: vi.fn(),
      registerAdmin: vi.fn(),
      saveToken: vi.fn(),
      readToken: vi.fn(),
      clearToken: vi.fn(),
    },
  }
})

vi.mock('../../services/util.service', () => ({
  utilService: {
    saveToStorage: vi.fn(),
    getFromStorage: vi.fn(),
    removeFromStorage: vi.fn(),
  },
}))

const mockedLogin = vi.mocked(authService.login)
const mockedSaveToken = vi.mocked(authService.saveToken)
const mockedReadToken = vi.mocked(authService.readToken)
const mockedClearToken = vi.mocked(authService.clearToken)
const mockedSaveToStorage = vi.mocked(utilService.saveToStorage)
const mockedGetFromStorage = vi.mocked(utilService.getFromStorage)

const credentials: AdminCredentials = {
  identifier: 'admin@example.com',
  password: 'a-password',
}

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSaveToken.mockResolvedValue(undefined)
  mockedClearToken.mockResolvedValue(undefined)
  mockedSaveToStorage.mockResolvedValue(undefined)
  mockedGetFromStorage.mockResolvedValue(null)
  mockedReadToken.mockResolvedValue(null)
})

describe('authSlice.login', () => {
  it('starts signed out', () => {
    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().admin).toBeNull()
  })

  it('stores the issued token and the admin identity on success', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse({ token: 'issued-token' }))

    await expect(useStore.getState().login(credentials)).resolves.toBe('success')

    expect(useStore.getState().token).toBe('issued-token')
    expect(useStore.getState().admin).toEqual({ id: 'admin-1', email: 'admin@example.com' })
  })

  it('persists the token so a refresh keeps the session', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse({ token: 'issued-token' }))

    await useStore.getState().login(credentials)

    expect(mockedSaveToken).toHaveBeenCalledWith('issued-token')
    expect(mockedSaveToStorage).toHaveBeenCalledWith(ADMIN_STORAGE_KEY, {
      id: 'admin-1',
      email: 'admin@example.com',
    })
  })

  it('reports rejected credentials as their own outcome, not as a failure', async () => {
    mockedLogin.mockRejectedValue(buildErrorWithStatus(401))

    await expect(useStore.getState().login(credentials)).resolves.toBe('invalidCredentials')

    expect(useStore.getState().token).toBeNull()
    expect(mockedSaveToken).not.toHaveBeenCalled()
  })

  it('reports a gateway failure as an error, distinct from a wrong password', async () => {
    mockedLogin.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().login(credentials)).resolves.toBe('error')
    expect(useStore.getState().token).toBeNull()
  })

  it('leaves no half-signed-in state behind after a failure', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse())
    await useStore.getState().login(credentials)

    mockedLogin.mockRejectedValue(buildErrorWithStatus(401))
    await useStore.getState().login(credentials)

    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().admin).toBeNull()
  })

  it('flags the request as in flight and clears the flag when it lands', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse())

    const pending = useStore.getState().login(credentials)
    expect(useStore.getState().isLoggingIn).toBe(true)

    await pending
    expect(useStore.getState().isLoggingIn).toBe(false)
  })

  it('blocks a second submit while the first is still in flight', async () => {
    mockedLogin.mockImplementation(() => new Promise(() => {}))

    void useStore.getState().login(credentials)
    await expect(useStore.getState().login(credentials)).resolves.toBe('error')

    expect(mockedLogin).toHaveBeenCalledTimes(1)
  })

  it('still signs the Admin in when caching their identity fails', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse({ token: 'issued-token' }))
    mockedSaveToStorage.mockRejectedValue(new Error('storage unavailable'))

    await expect(useStore.getState().login(credentials)).resolves.toBe('success')
    expect(useStore.getState().token).toBe('issued-token')
  })
})

describe('authSlice.logout', () => {
  it('clears the session in memory and in storage', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse())
    await useStore.getState().login(credentials)

    await useStore.getState().logout()

    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().admin).toBeNull()
    expect(mockedClearToken).toHaveBeenCalledTimes(1)
    expect(vi.mocked(utilService.removeFromStorage)).toHaveBeenCalledWith(ADMIN_STORAGE_KEY)
  })

  it('signs the Admin out even when clearing storage throws', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse())
    await useStore.getState().login(credentials)
    mockedClearToken.mockRejectedValue(new Error('storage unavailable'))

    await useStore.getState().logout()

    expect(useStore.getState().token).toBeNull()
  })
})

describe('authSlice.hydrateAuth', () => {
  it('restores a persisted session on startup', async () => {
    mockedReadToken.mockResolvedValue('stored-token')
    mockedGetFromStorage.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' })

    await useStore.getState().hydrateAuth()

    expect(useStore.getState().token).toBe('stored-token')
    expect(useStore.getState().admin).toEqual({ id: 'admin-1', email: 'admin@example.com' })
    expect(useStore.getState().isHydratingAuth).toBe(false)
  })

  it('restores the session even when the cached identity is gone', async () => {
    mockedReadToken.mockResolvedValue('stored-token')
    mockedGetFromStorage.mockResolvedValue(null)

    await useStore.getState().hydrateAuth()

    // The token is the session; the identity is only a nicety.
    expect(useStore.getState().token).toBe('stored-token')
    expect(useStore.getState().admin).toBeNull()
  })

  it('stays signed out when nothing was stored', async () => {
    await useStore.getState().hydrateAuth()

    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().isHydratingAuth).toBe(false)
  })

  it('finishes hydrating even when storage throws, rather than hanging the guard', async () => {
    mockedReadToken.mockRejectedValue(new Error('storage unavailable'))

    await useStore.getState().hydrateAuth()

    expect(useStore.getState().isHydratingAuth).toBe(false)
    expect(useStore.getState().token).toBeNull()
  })
})

describe('authSlice.createStaffAccount', () => {
  const mockedRegister = vi.mocked(authService.registerAdmin)

  const draft: StaffAccountDraft = {
    name: 'Dana Levi',
    email: 'dana@example.com',
    password: 'a-good-password',
  }

  beforeEach(() => {
    // This suite shares one store with the rest of the file, so the slice's own
    // fields are put back by hand rather than being assumed clean.
    useStore.setState({ createdStaffAccount: null, isCreatingStaffAccount: false })
  })

  it('records the created account so the screen can name it', async () => {
    mockedRegister.mockResolvedValue(buildRegisterResponse())

    await expect(useStore.getState().createStaffAccount(draft)).resolves.toBe('success')

    expect(useStore.getState().createdStaffAccount).toEqual({
      id: 'admin-2',
      name: 'Dana Levi',
      email: 'dana@example.com',
    })
  })

  it('never lets the password reach the store', async () => {
    mockedRegister.mockResolvedValue(buildRegisterResponse())

    await useStore.getState().createStaffAccount(draft)

    expect(JSON.stringify(useStore.getState().createdStaffAccount)).not.toContain(
      'a-good-password',
    )
  })

  it('does not sign the creating Admin into the new account', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse({ token: 'my-token' }))
    await useStore.getState().login(credentials)

    mockedRegister.mockResolvedValue(buildRegisterResponse())
    await useStore.getState().createStaffAccount(draft)

    // Creating an account for a colleague must leave the current session
    // exactly as it was — not swapped, not cleared.
    expect(useStore.getState().token).toBe('my-token')
    expect(useStore.getState().admin).toEqual({ id: 'admin-1', email: 'admin@example.com' })
  })

  it('reports a duplicate email as its own outcome, not as a failure', async () => {
    mockedRegister.mockRejectedValue(buildErrorWithStatus(409))

    await expect(useStore.getState().createStaffAccount(draft)).resolves.toBe('duplicateEmail')
    expect(useStore.getState().createdStaffAccount).toBeNull()
  })

  it('reports a gateway failure as an error, distinct from a taken address', async () => {
    mockedRegister.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().createStaffAccount(draft)).resolves.toBe('error')
    expect(useStore.getState().createdStaffAccount).toBeNull()
  })

  it('does not mistake an expired session for a duplicate email', async () => {
    // A 401 belongs to http.service's global session-expiry handler; this form
    // must not claim the address was taken when the real problem is the
    // creating Admin's own token.
    mockedRegister.mockRejectedValue(buildErrorWithStatus(401))

    await expect(useStore.getState().createStaffAccount(draft)).resolves.toBe('error')
  })

  it('blocks a second submit while the first is still in flight', async () => {
    mockedRegister.mockImplementation(() => new Promise(() => {}))

    void useStore.getState().createStaffAccount(draft)
    await expect(useStore.getState().createStaffAccount(draft)).resolves.toBe('error')

    expect(mockedRegister).toHaveBeenCalledTimes(1)
  })

  it('clears the busy flag whether the request succeeded or failed', async () => {
    mockedRegister.mockRejectedValue(new Error('Network Error'))

    await useStore.getState().createStaffAccount(draft)

    expect(useStore.getState().isCreatingStaffAccount).toBe(false)
  })

  it('drops the previous confirmation as soon as the next attempt starts', async () => {
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    await useStore.getState().createStaffAccount(draft)

    mockedRegister.mockRejectedValue(buildErrorWithStatus(409))
    await useStore.getState().createStaffAccount(draft)

    // A stale "created" message beside a form that just failed is worse than
    // no message at all.
    expect(useStore.getState().createdStaffAccount).toBeNull()
  })

  it('forgets the created account on sign-out', async () => {
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    await useStore.getState().createStaffAccount(draft)

    await useStore.getState().logout()

    expect(useStore.getState().createdStaffAccount).toBeNull()
  })
})

describe('authSlice.clearSession', () => {
  it('drops the in-memory session when the gateway reports the token is dead', async () => {
    mockedLogin.mockResolvedValue(buildLoginResponse())
    await useStore.getState().login(credentials)

    useStore.getState().clearSession()

    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().admin).toBeNull()
  })

  it('does nothing when nobody was signed in', () => {
    useStore.getState().clearSession()

    expect(useStore.getState().token).toBeNull()
  })
})
