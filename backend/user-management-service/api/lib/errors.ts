/**
 * Error shape is fixed by the API contract's `ApiError` schema:
 * `{ message, code }`. `message` is developer-facing English and must never
 * contain a secret, a submitted password, or account PII.
 */
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string, code = 'VALIDATION_FAILED') =>
  new ApiError(400, code, message)

export const unauthorized = (message: string, code = 'UNAUTHORIZED') =>
  new ApiError(401, code, message)

export const notFound = (message: string, code: string) => new ApiError(404, code, message)

/**
 * On this service, 409 means exactly one thing: the email is already
 * registered. The contract requires it be distinguishable from a generic 400
 * because the frontend surfaces it inline on the email field without
 * navigating away.
 */
export const conflict = (message: string, code: string) => new ApiError(409, code, message)
