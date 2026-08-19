import axios from 'axios'

// Namespace import on purpose. Reading a named binding at module scope would
// make this module fail to load the moment any test partially mocks
// http.service — and since the store now depends on this file, that would break
// every test in the app rather than the one under test. Every access below
// happens inside a function, so nothing is touched until it is actually used.
import * as http from './http.service'
import { normalizeCredentials, validateCredentials } from '../utils/auth.utils'
import type { AdminCredentials, LoginResponse } from '../types/auth.types'

// Endpoint mirrors docs/api-contract/api-contract.api-gateway.yaml. The gateway
// proxies it through to user-service; the frontend never talks to user-service
// directly (PRD F5: "user-service, via api-gateway").
export { LOGIN_ENDPOINT } from './http.service'

/**
 * HTTP status api-gateway returns when the identifier or the password is wrong.
 * The message is deliberately generic on the server side — it must not reveal
 * whether the account exists — so the client cannot and should not try to tell
 * the two cases apart either.
 */
export const INVALID_CREDENTIALS_STATUS = 401

/**
 * True for the one failure the login form treats as an expected outcome rather
 * than a fault: the credentials were rejected. Kept here, in the service that
 * owns the endpoint, so no page has to know that "that password is wrong" means
 * HTTP 401 (.rule/error-handling-rules.md).
 */
export function isInvalidCredentialsError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === INVALID_CREDENTIALS_STATUS
}

/**
 * Exchanges the Admin's credentials for a JWT (PRD F5). Rejects with a 401
 * AxiosError when they are wrong — the global session-expiry interceptor
 * deliberately ignores this one endpoint, because a rejected login is not an
 * expired session and must not wipe state or redirect.
 *
 * Validation runs again here even though the form already ran it: sending a
 * request that cannot succeed is a bug on our side, and refusing to send it is
 * cheaper and clearer than letting the gateway answer 400
 * (.rule/error-handling-rules.md, "fail fast on invalid input").
 */
async function login(credentials: AdminCredentials): Promise<LoginResponse> {
  if (Object.keys(validateCredentials(credentials)).length > 0) {
    console.log('[AUTH] refusing to send an incomplete login')
    throw new Error('Missing credentials')
  }

  // Never logged, never echoed: the password exists only in this payload.
  return http.gatewayHttpService.post<LoginResponse>(
    http.LOGIN_ENDPOINT,
    normalizeCredentials(credentials),
  )
}

export const authService = {
  login,
  /** Persists the issued token so a refresh does not force a re-login. */
  saveToken: (token: string) => http.saveToken(token),
  /** Reads the persisted token — used once, to restore a session on boot. */
  readToken: () => http.readToken(),
  /**
   * Drops the persisted token. Logout is purely client-side in v1: there is no
   * server-side blacklist, so a token stays technically valid until its expiry.
   */
  clearToken: () => http.removeToken(),
}
