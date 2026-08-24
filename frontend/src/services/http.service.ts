import type {
  ApiErrorBody,
  HttpMethod,
  RequestOptions,
  ServiceName,
} from '../types/api.types'
import { clearAuthToken, getAuthToken } from './util.service'

/**
 * Central HTTP layer. Every domain service calls through here — never `fetch`
 * directly, and never from a component.
 *
 * Responsibilities centralized here (do not duplicate them per service/page):
 * - resolving each service's base URL from env (no hardcoded URLs)
 * - attaching the admin JWT
 * - 401 session-expiry: clear auth state + redirect to login
 * - classifying 409 seat conflicts as their own error type
 */

/** Non-2xx response from a backend service. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * A `seat` action targeted a seat that is no longer in the expected status.
 * Expected during normal concurrent use — callers must handle it distinctly
 * from a generic ApiError and re-sync the affected seat map.
 */
export class ConflictError extends ApiError {
  constructor(message: string, code?: string) {
    super(409, message, code)
    this.name = 'ConflictError'
  }
}

/** Request failed before a response was received (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

const BASE_URLS: Record<ServiceName, string | undefined> = {
  'tour-service': import.meta.env.VITE_TOUR_SERVICE_BASE_URL,
  'user-management-service': import.meta.env.VITE_USER_SERVICE_BASE_URL,
}

const LOGIN_PATH = '/login'

function resolveBaseUrl(service: ServiceName): string {
  const baseUrl = BASE_URLS[service]
  if (!baseUrl) {
    throw new Error(
      `Missing base URL env var for ${service}. Set VITE_TOUR_SERVICE_BASE_URL / VITE_USER_SERVICE_BASE_URL.`,
    )
  }
  return baseUrl.replace(/\/+$/, '')
}

function buildUrl(service: ServiceName, path: string, params: RequestOptions['params']): string {
  const url = new URL(`${resolveBaseUrl(service)}${path.startsWith('/') ? path : `/${path}`}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/** Global session-expiry handling — never duplicated per service or page. */
async function handleSessionExpiry() {
  console.log('[HTTP] session expired, clearing auth and redirecting to login')
  await clearAuthToken()
  if (typeof globalThis.location !== 'undefined' && globalThis.location.pathname !== LOGIN_PATH) {
    globalThis.location.assign(LOGIN_PATH)
  }
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    return (await res.json()) as ApiErrorBody
  } catch {
    return {}
  }
}

async function request<TResponse>(
  method: HttpMethod,
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<TResponse> {
  const { service, params, withAuth = true, signal } = options
  const url = buildUrl(service, path, params)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (withAuth) {
    const token = await getAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    console.log('[HTTP] network failure', method, path)
    throw new NetworkError('Network request failed')
  }

  if (res.status === 401) {
    await handleSessionExpiry()
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    const errorBody = await parseErrorBody(res)
    const message = errorBody.message ?? `Request failed with status ${res.status}`
    console.log('[HTTP] request failed', method, path, res.status)

    if (res.status === 409) throw new ConflictError(message, errorBody.code)
    throw new ApiError(res.status, message, errorBody.code)
  }

  if (res.status === 204) return undefined as TResponse
  return (await res.json()) as TResponse
}

export const httpService = {
  get<T>(path: string, options: RequestOptions) {
    return request<T>('GET', path, undefined, options)
  },
  post<T>(path: string, body: unknown, options: RequestOptions) {
    return request<T>('POST', path, body, options)
  },
  put<T>(path: string, body: unknown, options: RequestOptions) {
    return request<T>('PUT', path, body, options)
  },
  patch<T>(path: string, body: unknown, options: RequestOptions) {
    return request<T>('PATCH', path, body, options)
  },
  delete<T>(path: string, options: RequestOptions) {
    return request<T>('DELETE', path, undefined, options)
  },
}
