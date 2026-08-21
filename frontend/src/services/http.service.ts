import axios, { type AxiosError, type AxiosInstance } from 'axios'

import { utilService } from './util.service'

// Two origins, because the PRD routes them differently: the public booking
// screens (F1-F4b) call booking-service directly, while every Admin route
// (F5-F11) goes "via api-gateway", which is where the JWT is verified.
// Domain services still only ever see relative endpoints — which origin a call
// leaves by is decided here and nowhere else.
//
// Single-origin deploy: in production the built bundle is served by
// api-gateway itself, which also reverse-proxies `/api/...`. There is then no
// second origin to name, so an *unset* base URL is the correct configuration —
// requests fall back to a relative path and hit the same origin the app was
// served from. That is why the "not set" notice below is dev-only: in a
// production build it is the expected state, not a misconfiguration.
//
// The env vars stay supported (and stay required for the Capacitor native
// build, which is served from a `capacitor://` / `file://` origin and so has
// no gateway to fall back to) — they simply become optional on the web build.
function resolveBaseUrl(value: string | undefined, varName: string): string {
  const baseUrl = (value ?? '').trim()

  if (!baseUrl && import.meta.env.DEV) {
    // Deliberately not defaulted to a hardcoded host: in dev there is no
    // gateway serving the bundle, so a relative path is almost certainly a
    // mistake. Copy frontend/.env.example to frontend/.env to fix it.
    console.log(`[HTTP] ${varName} is not set — requests will use a relative same-origin path`)
  }

  // Trailing slashes are stripped here so callers can always pass endpoints
  // that start with `/api/...` without producing a doubled slash.
  return baseUrl.replace(/\/+$/, '')
}

const BOOKING_SERVICE_URL = resolveBaseUrl(
  import.meta.env.VITE_BOOKING_SERVICE_URL,
  'VITE_BOOKING_SERVICE_URL',
)
const API_GATEWAY_URL = resolveBaseUrl(
  import.meta.env.VITE_API_GATEWAY_URL,
  'VITE_API_GATEWAY_URL',
)

export const AUTH_TOKEN_KEY = 'authToken'

const ADMIN_LOGIN_ROUTE = '/admin/login'

/**
 * The one endpoint whose 401 is *not* a session expiry. A rejected login means
 * "those credentials are wrong", so it must not clear state and bounce the
 * Admin to the login page they are already standing on — the form has to be
 * left intact to show its own error (.rule/error-handling-rules.md).
 */
export const LOGIN_ENDPOINT = '/api/auth/login'

// The Admin token, when one exists. Customers never have one — the public
// booking endpoints are called with no Authorization header at all.
async function getToken(): Promise<string | null> {
  return utilService.getFromStorage<string>(AUTH_TOKEN_KEY)
}

async function clearToken(): Promise<void> {
  await utilService.removeFromStorage(AUTH_TOKEN_KEY)
}

/** Persists the Admin token so a page refresh does not force a re-login. */
export async function saveToken(token: string): Promise<void> {
  await utilService.saveToStorage(AUTH_TOKEN_KEY, token)
}

export { getToken as readToken, clearToken as removeToken }

// Lets the auth slice clear its own in-memory state on session expiry without
// http.service importing the store (which would create an import cycle:
// store -> slice -> service -> http.service -> store).
type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

/**
 * Builds a client for one origin. Both clients get the same interceptors, so
 * session expiry is handled identically no matter which backend answered — the
 * single place 401 is handled. Individual services and pages must not duplicate
 * session-expiry logic (.rule/error-handling-rules.md).
 */
function createClient(baseURL: string): AxiosInstance {
  // baseURL is already normalised by resolveBaseUrl; an empty string means
  // "same origin", which is exactly what axios does with a relative path.
  const instance = axios.create({ baseURL })

  instance.interceptors.request.use(async (config) => {
    const token = await getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const isLoginAttempt = error.config?.url === LOGIN_ENDPOINT

      if (error.response?.status === 401 && !isLoginAttempt) {
        console.log('[HTTP] session expired, clearing auth state')
        await clearToken()
        onUnauthorized?.()

        if (window.location.pathname !== ADMIN_LOGIN_ROUTE) {
          window.location.href = ADMIN_LOGIN_ROUTE
        }
      }

      return Promise.reject(error)
    },
  )

  return instance
}

function createHttpService(instance: AxiosInstance) {
  return {
    async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
      const response = await instance.get<T>(endpoint, { params })
      return response.data
    },
    async post<T>(endpoint: string, data?: unknown): Promise<T> {
      const response = await instance.post<T>(endpoint, data)
      return response.data
    },
    async put<T>(endpoint: string, data?: unknown): Promise<T> {
      const response = await instance.put<T>(endpoint, data)
      return response.data
    },
    async patch<T>(endpoint: string, data?: unknown): Promise<T> {
      const response = await instance.patch<T>(endpoint, data)
      return response.data
    },
    async delete<T>(endpoint: string): Promise<T> {
      const response = await instance.delete<T>(endpoint)
      return response.data
    },
  }
}

/** The public booking origin (booking-service). */
export const httpService = createHttpService(createClient(BOOKING_SERVICE_URL))

/** The Admin origin (api-gateway) — every authenticated route goes through it. */
export const gatewayHttpService = createHttpService(createClient(API_GATEWAY_URL))
