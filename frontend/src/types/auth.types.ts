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

/**
 * What an already-signed-in Admin types to create another Admin/staff account
 * (PRD F12, Screen 8). There is no public sign-up: this shape only ever leaves
 * the app from inside the authenticated dashboard, on a route api-gateway
 * verifies the caller's JWT for.
 *
 * Note the asymmetry with AdminCredentials: logging in accepts an email *or* a
 * username on one field, but creating an account collects a real email, since
 * that is the identifier the new account will be given.
 */
export interface StaffAccountDraft {
  name: string
  email: string
  password: string
}

/**
 * The created account as user-service returns it. Deliberately the same shape
 * the login response carries, plus the name — and deliberately without the
 * password or its hash, which must never travel back to the client.
 */
export interface StaffAccount {
  id: string
  name: string
  email: string
}

/** Body of a successful `POST /api/auth/register`. */
export interface RegisterAdminResponse {
  admin: StaffAccount
}

/**
 * Result of a create-account attempt. A duplicate email is an ordinary outcome
 * of this form — the Admin cannot know what is already on record before asking
 * — so it is its own value rather than a generic failure.
 */
export type CreateStaffAccountOutcome = 'success' | 'duplicateEmail' | 'error'
