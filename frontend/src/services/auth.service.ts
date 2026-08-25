import type { SignupPayload, SignupResponse } from '../types/auth.types'
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

/** Drops the persisted token and the in-memory session. */
async function logout(): Promise<void> {
  await clearAuthToken()
  useStore.getState().clearSession()
  console.log('[AUTH] session cleared')
}

export const authService = {
  signup,
  logout,
}
