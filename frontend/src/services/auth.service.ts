import axios from 'axios'

// Namespace import on purpose. Reading a named binding at module scope would
// make this module fail to load the moment any test partially mocks
// http.service — and since the store now depends on this file, that would break
// every test in the app rather than the one under test. Every access below
// happens inside a function, so nothing is touched until it is actually used.
import * as http from './http.service'
import { normalizeCredentials, validateCredentials } from '../utils/auth.utils'
import { normalizeStaffAccount, validateStaffAccount } from '../utils/staffAccount.utils'
import type {
  AdminCredentials,
  LoginResponse,
  RegisterAdminResponse,
  StaffAccountDraft,
} from '../types/auth.types'

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
 * Creating another Admin/staff account (PRD F12, Screen 8).
 *
 * Read the difference from LOGIN_ENDPOINT carefully, because it is the whole
 * security story of this feature: login is the one gateway route deliberately
 * reachable without a token, and register is emphatically not. It is mounted
 * behind api-gateway's `verifyJwt`, so it can only be called by someone already
 * signed in — there is no public sign-up page in this product, and adding one
 * would be a regression the PRD calls out by name.
 *
 * Consequently this endpoint is *not* on http.service's session-expiry
 * exception list, and that is correct: a 401 here means the caller's own
 * session has expired, not that some credential was rejected, so the global
 * handler should clear the token and return them to the login screen exactly as
 * it does for every other Admin route.
 */
export const REGISTER_ENDPOINT = '/api/auth/register'

/**
 * HTTP status api-gateway returns when an account already exists for that email
 * address. The server answers with the field that collided and nothing more —
 * it must not say whether the existing account is active, who owns it, or when
 * it was created.
 */
export const DUPLICATE_EMAIL_STATUS = 409

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

/**
 * True for the one failure the staff-account form treats as an expected outcome
 * rather than a fault: an account already exists for that email. Kept here, in
 * the service that owns the endpoint, so no page has to know that "that address
 * is taken" means HTTP 409 (.rule/error-handling-rules.md).
 */
export function isDuplicateEmailError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === DUPLICATE_EMAIL_STATUS
}

/**
 * Creates another Admin/staff account (PRD F12). Requires the caller to already
 * be signed in — the JWT is attached by http.service's request interceptor, and
 * api-gateway rejects the call outright without one.
 *
 * The created account is a full Admin, immediately able to sign in: v1 has no
 * roles, no invite link and no activation step (PRD: "an existing Admin creates
 * the account directly and shares the credentials out of band").
 *
 * Validation runs again here even though the form already ran it, for the same
 * reason login does it: sending a request that cannot succeed is a bug on our
 * side, and refusing to send it is cheaper and clearer than letting the gateway
 * answer 400 (.rule/error-handling-rules.md, "fail fast on invalid input").
 */
async function registerAdmin(draft: StaffAccountDraft): Promise<RegisterAdminResponse> {
  if (Object.keys(validateStaffAccount(draft)).length > 0) {
    console.log('[AUTH] refusing to send an incomplete staff account')
    throw new Error('Invalid staff account')
  }

  // The password exists only in this payload — never logged, never echoed back
  // into a message, never put in the store.
  return http.gatewayHttpService.post<RegisterAdminResponse>(
    REGISTER_ENDPOINT,
    normalizeStaffAccount(draft),
  )
}

export const authService = {
  login,
  registerAdmin,
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
