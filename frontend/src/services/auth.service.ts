import type {
  LoginPayload,
  LoginResponse,
  SignupPayload,
  SignupResponse,
} from '../types/auth.types'
import { useStore } from '../store/store'
import { httpService } from './http.service'
import { clearAuthToken, setAuthToken } from './util.service'

/**
 * Auth domain service (`user-management-service`).
 *
 * All requests go through `http.service.ts` — never `fetch` directly, and never
 * from a component. Errors propagate to the calling page/hook, which maps them
 * to hardcoded Hebrew copy (.rule/error-handling-rules.md).
 */

const SERVICE = 'user-management-service' as const

/**
 * Creates a new account.
 *
 * Sends only `fullName`, `email`, `password` — never a `roles`/`isAdmin` field,
 * which the server ignores anyway. The account is always created with
 * `roles: ["user"]` (PRD F2b), so the returned token is a plain authenticated
 * user session, not admin authorization.
 *
 * Throws `ConflictError` (409) when the email is already registered.
 */
async function signup(payload: SignupPayload): Promise<SignupResponse> {
  const body: SignupPayload = {
    fullName: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
  }

  // withAuth: false — signup must never carry an existing bearer token.
  const res = await httpService.post<SignupResponse>('/api/auth/signup', body, {
    service: SERVICE,
    withAuth: false,
  })

  // The service updates the store directly; the page must not repeat this.
  await setAuthToken(res.token)
  useStore.getState().setSession(res.user)
  console.log('[AUTH] signup succeeded, session established with roles', res.user.roles.join(','))

  return res
}

/**
 * Authenticates an admin (PRD F1, Screen 1's login modal).
 *
 * The server only issues a token for an account whose `roles` include `admin`
 * (plan 006, Open Question 1) and answers every failure mode — unknown email,
 * wrong password, valid non-admin account — with the same generic 401, so
 * nothing here may branch on which one it was.
 *
 * Throws `ApiError` with `status: 401` on invalid credentials. Because the
 * request is sent with `withAuth: false`, `http.service.ts` does not treat that
 * 401 as session expiry: no auth wipe, no redirect — the caller renders it
 * inline and the modal stays open (plan 006, Validation).
 *
 * The password is never logged, and never stored anywhere after the call.
 */
async function login(payload: LoginPayload): Promise<LoginResponse> {
  const body: LoginPayload = {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
  }

  const res = await httpService.post<LoginResponse>('/api/auth/login', body, {
    service: SERVICE,
    withAuth: false,
  })

  // The service updates the store directly; the page must not repeat this.
  await setAuthToken(res.token)
  useStore.getState().setSession(res.user)
  console.log('[AUTH] login succeeded, session established with roles', res.user.roles.join(','))

  return res
}

/** Drops the persisted token and the in-memory session. */
async function logout(): Promise<void> {
  await clearAuthToken()
  useStore.getState().clearSession()
  console.log('[AUTH] session cleared')
}

export const authService = {
  signup,
  login,
  logout,
}
