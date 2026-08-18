import { beforeEach, describe, expect, it, vi } from 'vitest'

// The axios instance is created at module load, so it has to exist before the
// module under test is imported — vi.hoisted runs ahead of the mock factory.
const mocks = vi.hoisted(() => {
  const requestInterceptors: ((config: unknown) => unknown)[] = []
  const responseErrorInterceptors: ((error: unknown) => unknown)[] = []

  const instance = {
    interceptors: {
      request: {
        use: (onFulfilled: (config: unknown) => unknown) => {
          requestInterceptors.push(onFulfilled)
        },
      },
      response: {
        use: (_onFulfilled: unknown, onRejected: (error: unknown) => unknown) => {
          responseErrorInterceptors.push(onRejected)
        },
      },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }

  return { instance, requestInterceptors, responseErrorInterceptors, create: vi.fn(() => instance) }
})

vi.mock('axios', () => ({
  default: { create: mocks.create },
}))

const { httpService, AUTH_TOKEN_KEY, setUnauthorizedHandler } = await import('./http.service')

const applyRequestInterceptor = async (config: { headers: Record<string, string> }) => {
  let result: unknown = config
  for (const interceptor of mocks.requestInterceptors) {
    result = await interceptor(result)
  }
  return result as { headers: Record<string, string> }
}

/** Drives the response interceptor with a minimal axios-shaped failure. */
const rejectWith = async (status: number) => {
  const interceptor = mocks.responseErrorInterceptors[0]
  return interceptor({ response: { status } })
}

const stubLocation = (pathname: string) => {
  const location = { pathname, href: `http://localhost${pathname}` }
  Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
  return location
}

describe('httpService verbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUnauthorizedHandler(null)
  })

  it('unwraps the response body so callers never touch the axios envelope', async () => {
    mocks.instance.get.mockResolvedValue({ data: [{ id: 'a' }] })

    await expect(httpService.get('/api/services')).resolves.toEqual([{ id: 'a' }])
  })

  it('forwards query params on GET', async () => {
    mocks.instance.get.mockResolvedValue({ data: [] })

    await httpService.get('/api/time-slots', { serviceId: 'abc' })

    expect(mocks.instance.get).toHaveBeenCalledWith('/api/time-slots', {
      params: { serviceId: 'abc' },
    })
  })

  it('sends the body on POST and returns the created resource', async () => {
    mocks.instance.post.mockResolvedValue({ data: { id: 'new' } })

    await expect(httpService.post('/api/appointments', { name: 'Dana' })).resolves.toEqual({
      id: 'new',
    })
    expect(mocks.instance.post).toHaveBeenCalledWith('/api/appointments', { name: 'Dana' })
  })
})

describe('authentication header', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sends no Authorization header for a public booking request', async () => {
    const config = await applyRequestInterceptor({ headers: {} })

    expect(config.headers.Authorization).toBeUndefined()
  })

  it('attaches the stored Admin token when one exists', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify('admin-token'))

    const config = await applyRequestInterceptor({ headers: {} })

    expect(config.headers.Authorization).toBe('Bearer admin-token')
  })
})

describe('session expiry (401)', () => {
  beforeEach(() => {
    localStorage.clear()
    setUnauthorizedHandler(null)
    stubLocation('/admin/appointments')
  })

  it('clears the stored token and redirects to Admin login', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify('expired-token'))
    const location = stubLocation('/admin/appointments')

    await expect(rejectWith(401)).rejects.toBeDefined()

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(location.href).toBe('/admin/login')
  })

  it('notifies the registered handler so auth state can be reset', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)

    await expect(rejectWith(401)).rejects.toBeDefined()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not redirect again when already on the login page', async () => {
    const location = stubLocation('/admin/login')

    await expect(rejectWith(401)).rejects.toBeDefined()

    expect(location.href).toBe('http://localhost/admin/login')
  })

  it('leaves other failures untouched for the caller to handle', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify('valid-token'))

    await expect(rejectWith(409)).rejects.toBeDefined()

    expect(handler).not.toHaveBeenCalled()
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).not.toBeNull()
  })
})
