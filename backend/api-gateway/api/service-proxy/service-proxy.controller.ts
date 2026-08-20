import type { Request, Response } from 'express'

import { forwardServiceRequest, UpstreamUnavailableError } from './service-proxy.service.ts'

const UPSTREAM_ERROR = { error: 'Booking service unavailable' }
const NOT_FOUND_ERROR = { error: 'Service not found' }

// 8-4-4-4-12 hex, any version. The contract types every Service `id` as a uuid,
// so anything else cannot name an existing record.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// verifyJwt has already run on every route in this module, so `req.admin` is
// always present; the fallback exists only to satisfy the type.
function adminId(req: Request): string {
  return req.admin?.sub ?? ''
}

function fail(res: Response, message: string): void {
  res.status(400).json({ error: message })
}

// --- Field validators -------------------------------------------------------
// Shared by create and patch so the two can never drift. Each returns an error
// message, or null when the value is acceptable.

function nameError(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Name is required'
  }
  if (value.trim().length > 60) {
    return 'Name must be at most 60 characters'
  }
  return null
}

function durationError(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'durationMinutes must be a whole number of minutes'
  }
  if (!Number.isInteger(value)) {
    // TimeSlot boundaries are generated from this — a fraction puts every
    // slot off the clock.
    return 'durationMinutes must be a whole number of minutes'
  }
  if (value < 1 || value > 480) {
    return 'durationMinutes must be between 1 and 480'
  }
  return null
}

function priceError(value: unknown): string | null {
  // Zero is valid — a complimentary treatment is a real case.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'price must be a number'
  }
  if (value < 0 || value > 100000) {
    return 'price must be between 0 and 100000'
  }
  return null
}

// Maps a booking-service status onto this contract's vocabulary. Anything the
// contract does not define for the route is an upstream failure (502), never a
// pass-through of an unexpected status.
function relayError(res: Response, status: number, body: unknown, allow404: boolean): void {
  if (status === 400) {
    const message =
      typeof (body as { error?: unknown })?.error === 'string'
        ? (body as { error: string }).error
        : 'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  if (status === 404 && allow404) {
    res.status(404).json(NOT_FOUND_ERROR)
    return
  }

  // Includes booking-service's 503 (database not connected): from the Admin's
  // point of view the gateway simply could not reach the service.
  res.status(502).json(UPSTREAM_ERROR)
}

function handleUpstreamThrow(res: Response, error: unknown): void {
  if (error instanceof UpstreamUnavailableError) {
    res.status(502).json(UPSTREAM_ERROR)
    return
  }
  res.status(502).json(UPSTREAM_ERROR)
}

// --- Handlers ---------------------------------------------------------------

// GET /api/services/all — the Admin catalogue view: no isActive filter, because
// showing the deactivated records is the entire point of Screen 6.
export async function getAllServices(req: Request, res: Response): Promise<void> {
  try {
    const upstream = await forwardServiceRequest({
      method: 'GET',
      path: '/all',
      internalAdminId: adminId(req),
    })

    if (upstream.status === 200) {
      res.status(200).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, false)
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}

// POST /api/services — create. The payload carries no `isActive`: a new Service
// is always active, so only the three draft fields are ever relayed.
export async function postService(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>

  const nameProblem = nameError(body.name)
  if (nameProblem) {
    fail(res, 'Name, durationMinutes and price are required')
    return
  }
  const durationProblem = durationError(body.durationMinutes)
  if (durationProblem) {
    fail(res, durationProblem)
    return
  }
  const priceProblem = priceError(body.price)
  if (priceProblem) {
    fail(res, priceProblem)
    return
  }

  try {
    const upstream = await forwardServiceRequest({
      method: 'POST',
      path: '',
      internalAdminId: adminId(req),
      // Only the three contract fields — never `isActive`, never anything else
      // the client happened to send.
      body: {
        name: (body.name as string).trim(),
        durationMinutes: body.durationMinutes,
        price: body.price,
      },
    })

    if (upstream.status === 201 || upstream.status === 200) {
      res.status(201).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, false)
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}

// PATCH /api/services/:id — partial update. Applies exactly the fields present
// and leaves the rest alone, so a stale form cannot revert another Admin's edit.
export async function patchService(req: Request, res: Response): Promise<void> {
  const id = req.params.id
  if (!UUID_PATTERN.test(id)) {
    res.status(404).json(NOT_FOUND_ERROR)
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  // An ABSENT field is not validated — omitting the name is not the same as
  // blanking it.
  if ('name' in body) {
    const problem = nameError(body.name)
    if (problem) {
      fail(res, problem)
      return
    }
    patch.name = (body.name as string).trim()
  }

  if ('durationMinutes' in body) {
    const problem = durationError(body.durationMinutes)
    if (problem) {
      fail(res, problem)
      return
    }
    patch.durationMinutes = body.durationMinutes
  }

  if ('price' in body) {
    const problem = priceError(body.price)
    if (problem) {
      fail(res, problem)
      return
    }
    patch.price = body.price
  }

  // Patchable on purpose: this is the only route back from a soft delete.
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') {
      fail(res, 'isActive must be a boolean')
      return
    }
    patch.isActive = body.isActive
  }

  // An empty patch is a request that cannot accomplish anything. Unknown-only
  // bodies land here too, since no known field was collected.
  if (Object.keys(patch).length === 0) {
    fail(res, 'At least one field must be provided')
    return
  }

  try {
    const upstream = await forwardServiceRequest({
      method: 'PATCH',
      path: `/${encodeURIComponent(id)}`,
      internalAdminId: adminId(req),
      body: patch,
    })

    if (upstream.status === 200) {
      res.status(200).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, true)
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}

// PATCH /api/services/:id/deactivate — soft delete. Sets isActive: false and
// nothing else; it must not cascade to TimeSlot or Appointment records. No body
// is accepted or relayed, so the intent is unambiguous in the logs.
export async function patchDeactivateService(req: Request, res: Response): Promise<void> {
  const id = req.params.id
  if (!UUID_PATTERN.test(id)) {
    res.status(404).json(NOT_FOUND_ERROR)
    return
  }

  try {
    const upstream = await forwardServiceRequest({
      method: 'PATCH',
      path: `/${encodeURIComponent(id)}/deactivate`,
      internalAdminId: adminId(req),
    })

    if (upstream.status === 200) {
      res.status(200).json(upstream.body)
      return
    }

    relayError(res, upstream.status, upstream.body, true)
  } catch (error) {
    handleUpstreamThrow(res, error)
  }
}
