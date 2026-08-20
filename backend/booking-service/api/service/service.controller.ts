import type { Request, Response } from 'express'

import { isDbConnected } from '../lib/db.ts'
import {
  createService,
  deactivateService,
  listActiveServices,
  listAllServices,
  updateService,
  type UpdateServicePatch,
} from './service.service.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A well-formed uuid, and a string — Express can hand back an array or an object
 * for a crafted parameter, and that must be rejected rather than reaching a
 * database filter.
 */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// A non-empty, non-blank string. Rejects numbers/objects/arrays outright rather
// than coercing them into a name.
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// A whole number of minutes, at least 1 (contract: durationMinutes integer >= 1).
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

// A finite, non-negative price (contract: price number >= 0).
function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

// A JSON object body — not null, not an array.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * GET /api/services — public, unauthenticated (PRD: all public booking routes
 * are unauthenticated). Request/response shape only; all logic lives in the
 * service layer.
 *
 * Any query string the client sends is ignored outright — `req.query` is never
 * read here, per the contract.
 */
export async function getServices(_req: Request, res: Response): Promise<void> {
  // A DB that is not connected is a 503 (transient, retryable) rather than a
  // 500, so the frontend can distinguish "come back later" from a real bug.
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  try {
    const services = await listActiveServices()
    res.status(200).json(services)
  } catch (err) {
    // Never leak a stack trace or a raw Mongoose error to the client — the
    // detail goes to the logs, the client gets the uniform error envelope.
    console.error('booking-service: GET /api/services failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * GET /api/services/all — Admin only (PRD F6-F8 list view). Returns every
 * Service, including deactivated ones.
 *
 * There is no auth check here by design: `booking-service` is an internal
 * service and trusts `api-gateway` to have verified the Admin JWT before
 * forwarding (the `x-internal-admin` trust boundary from plan 011). That means
 * this port must never be exposed publicly — documented as a deployment
 * constraint in plan 012's Risks, not re-checked here.
 */
export async function getAllServices(_req: Request, res: Response): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  try {
    const services = await listAllServices()
    res.status(200).json(services)
  } catch (err) {
    console.error('booking-service: GET /api/services/all failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * POST /api/services — create a Service (PRD F6). Admin only, see the trust
 * note on `getAllServices`.
 *
 * `isActive` is not read from the body: a new Service is always active.
 */
export async function postService(req: Request, res: Response): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const body: unknown = req.body
  if (!isPlainObject(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' })
    return
  }

  if (!isNonEmptyString(body.name)) {
    res.status(400).json({ error: 'Field "name" must be a non-empty string' })
    return
  }
  if (!isPositiveInteger(body.durationMinutes)) {
    res.status(400).json({ error: 'Field "durationMinutes" must be an integer of at least 1' })
    return
  }
  if (!isNonNegativeNumber(body.price)) {
    res.status(400).json({ error: 'Field "price" must be a number of at least 0' })
    return
  }

  try {
    const created = await createService({
      name: body.name.trim(),
      durationMinutes: body.durationMinutes,
      price: body.price,
    })
    res.status(201).json(created)
  } catch (err) {
    console.error('booking-service: POST /api/services failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * PATCH /api/services/:id — partial edit (PRD F7). Admin only, see the trust
 * note on `getAllServices`.
 *
 * Only `name`, `durationMinutes`, `price` and `isActive` are ever read; every
 * other key in the body is ignored rather than passed through, so nothing a
 * client sends can reach `deletedAt`, `uuid` or a Mongo operator. Fields that
 * are absent are left untouched; fields that are present are validated with the
 * same rules as create.
 */
export async function patchService(req: Request, res: Response): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { id } = req.params
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Path parameter "id" must be a uuid' })
    return
  }

  const body: unknown = req.body
  if (!isPlainObject(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' })
    return
  }

  const patch: UpdateServicePatch = {}

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) {
      res.status(400).json({ error: 'Field "name" must be a non-empty string' })
      return
    }
    patch.name = body.name.trim()
  }
  if (body.durationMinutes !== undefined) {
    if (!isPositiveInteger(body.durationMinutes)) {
      res.status(400).json({ error: 'Field "durationMinutes" must be an integer of at least 1' })
      return
    }
    patch.durationMinutes = body.durationMinutes
  }
  if (body.price !== undefined) {
    if (!isNonNegativeNumber(body.price)) {
      res.status(400).json({ error: 'Field "price" must be a number of at least 0' })
      return
    }
    patch.price = body.price
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      res.status(400).json({ error: 'Field "isActive" must be a boolean' })
      return
    }
    patch.isActive = body.isActive
  }

  try {
    const updated = await updateService(id, patch)
    if (!updated) {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    res.status(200).json(updated)
  } catch (err) {
    console.error('booking-service: PATCH /api/services/:id failed:', (err as Error).message)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * PATCH /api/services/:id/deactivate — soft delete (PRD F8). Admin only, see
 * the trust note on `getAllServices`.
 *
 * The request has no body, and none is read: calling this endpoint is itself
 * the entire instruction, so the resulting state is always `isActive: false`
 * and can never be steered by client input.
 */
export async function patchDeactivateService(req: Request, res: Response): Promise<void> {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Service Unavailable' })
    return
  }

  const { id } = req.params
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Path parameter "id" must be a uuid' })
    return
  }

  try {
    const updated = await deactivateService(id)
    if (!updated) {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    res.status(200).json(updated)
  } catch (err) {
    console.error(
      'booking-service: PATCH /api/services/:id/deactivate failed:',
      (err as Error).message,
    )
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
