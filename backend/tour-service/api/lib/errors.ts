/**
 * Error shape is fixed by the API contract's `ApiError` schema:
 * `{ message, code }`. `message` is developer-facing English and must never
 * contain a secret or passenger PII (name/phone).
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

export const notFound = (message: string, code: string) => new ApiError(404, code, message)

/** Reserved exclusively for seat status-precondition failures — never a generic 400. */
export const conflict = (message: string, code: string) => new ApiError(409, code, message)
