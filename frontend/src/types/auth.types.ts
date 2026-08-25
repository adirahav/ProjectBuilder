/** Auth domain types (`user-management-service`). */

/**
 * Permission levels carried on the `admin` entity's `roles` array.
 * `passenger` is never modeled here — passengers are unauthenticated.
 */
export type Role = 'admin' | 'user'

/** The authenticated account as returned by `user-management-service`. */
export type AuthUser = {
  id: string
  fullName: string
  email: string
  roles: Role[]
}

/** Request body for `POST /api/auth/signup`. */
export type SignupPayload = {
  fullName: string
  email: string
  password: string
}

/**
 * Response body for `POST /api/auth/signup`.
 *
 * The token authenticates a plain `user` session. Signup never grants `admin`
 * — the server hardcodes `roles: ["user"]` (PRD F2b / AC-2) — so nothing in the
 * UI may treat this token as admin-authorizing.
 */
export type SignupResponse = {
  token: string
  user: AuthUser
}

/** Per-field client-side validation errors for the signup form. */
export type SignupFieldErrors = Partial<Record<keyof SignupPayload, string>>

/**
 * Request body for `POST /api/auth/login`.
 *
 * The PRD calls this "username"; functionally it is the `email` already carried
 * by the `User` model (plan 006, Open Question 3) — no separate `username`
 * field exists, so the login identifier is the account email.
 */
export type LoginPayload = {
  email: string
  password: string
}

/**
 * Response body for `POST /api/auth/login`.
 *
 * Identical in shape to `SignupResponse`, but the semantics differ: this
 * endpoint only succeeds for an account whose `roles` include `admin` (plan 006,
 * Open Question 1), so the returned token IS admin-authorizing. `isAdmin` is
 * still derived from the returned `roles`, never assumed from "login succeeded".
 */
export type LoginResponse = {
  token: string
  user: AuthUser
}

/** Per-field client-side validation errors for the admin login form. */
export type LoginFieldErrors = Partial<Record<keyof LoginPayload, string>>
