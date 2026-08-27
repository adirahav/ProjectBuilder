import type { Request, Response, NextFunction } from 'express'
import { ApiError } from './errors.js'

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' })
}

/**
 * Single exit point for every error. Expected business-rule rejections carry
 * their own status/code; anything else is a genuine 500 and its details stay in
 * the log, never in the response body — no stack trace and no raw Mongoose
 * error object ever reaches a client.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message, code: err.code })
  }

  // The request body carries a plaintext password on every auth route, so only
  // the error message is logged — never the body, never the error object.
  console.log('[ERROR] unhandled error in user-management-service:', (err as Error)?.message)
  return res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_ERROR' })
}
