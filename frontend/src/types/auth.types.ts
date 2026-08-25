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
