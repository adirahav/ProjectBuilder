/**
 * Admin authentication (PRD F5, Screen 5). There is exactly one Admin account
 * in v1 and no Customer ever logs in — a Customer has no account at all — so
 * everything here is about that single authenticated role.
 */

/** What the Admin types into the login form. */
export interface AdminCredentials {
  /** Email or username — the backend accepts either on the same field. */
  identifier: string
  password: string
}

/** The Admin's identity as returned by user-service alongside the token. */
export interface AdminIdentity {
  id: string
  email: string
}

/** Body of a successful `POST /api/auth/login`. */
export interface LoginResponse {
  token: string
  admin: AdminIdentity
}

/**
 * Result of a login attempt. Wrong credentials are an ordinary outcome of a
 * login form, not a failure of the system, so they are modelled as their own
 * value rather than as a thrown error.
 */
export type LoginOutcome = 'success' | 'invalidCredentials' | 'error'
