import axios, { type AxiosError } from 'axios'

import { utilService } from './util.service'

// Public booking routes are unauthenticated by design, so today every request
// this app makes goes straight to booking-service. Once api-gateway proxies the
// Admin routes, this becomes the gateway's single /api prefix and nothing else
// in the app has to change — domain services only ever see relative endpoints.
const BASE_URL = import.meta.env.VITE_BOOKING_SERVICE_URL ?? ''

if (!BASE_URL) {
  // Deliberately not defaulted to a hardcoded host: an unset base URL is a
  // configuration error, and failing visibly beats silently calling the wrong
  // origin. Copy frontend/.env.example to frontend/.env to fix it.
  console.log('[HTTP] VITE_BOOKING_SERVICE_URL is not set — API requests will use a relative path')
}

export const AUTH_TOKEN_KEY = 'authToken'

const ADMIN_LOGIN_ROUTE = '/admin/login'

const axiosInstance = axios.create({
  baseURL: BASE_URL.replace(/\/+$/, ''),
})

// The Admin token, when one exists. Customers never have one — the public
// booking endpoints are called with no Authorization header at all.
async function getToken(): Promise<string | null> {
  return utilService.getFromStorage<string>(AUTH_TOKEN_KEY)
}

async function clearToken(): Promise<void> {
  await utilService.removeFromStorage(AUTH_TOKEN_KEY)
}

// Lets the auth slice clear its own in-memory state on session expiry without
// http.service importing the store (which would create an import cycle:
// store -> slice -> service -> http.service -> store).
type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

axiosInstance.interceptors.request.use(async (config) => {
  const token = await getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// The single place 401 is handled. Individual services and pages must not
// duplicate session-expiry logic (.rule/error-handling-rules.md).
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
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

export const httpService = {
  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    const response = await axiosInstance.get<T>(endpoint, { params })
    return response.data
  },
  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.post<T>(endpoint, data)
    return response.data
  },
  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.put<T>(endpoint, data)
    return response.data
  },
  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.patch<T>(endpoint, data)
    return response.data
  },
  async delete<T>(endpoint: string): Promise<T> {
    const response = await axiosInstance.delete<T>(endpoint)
    return response.data
  },
}
