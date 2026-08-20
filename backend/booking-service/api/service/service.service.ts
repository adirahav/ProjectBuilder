import { Service } from '../models/service.model.ts'

// Exactly the fields the contract's Service schema allows
// (additionalProperties: false) — nothing else is ever serialized.
export interface PublicService {
  id: string
  name: string
  durationMinutes: number
  price: number
  isActive: boolean
}

/**
 * All active Services, newest first.
 *
 * The filter is a hardcoded literal: this endpoint accepts no query parameters
 * and nothing from the request ever reaches the database filter, which rules
 * out NoSQL-injection via the query string. `isActive: true` is the
 * customer-facing soft-delete rule (PRD AC-4); `deletedAt: null` is added by
 * the schema hook.
 *
 * `.lean()` bypasses Mongoose's toJSON transform, so the uuid -> id mapping is
 * done explicitly here rather than assumed.
 */
export async function listActiveServices(): Promise<PublicService[]> {
  const docs = await Service.find({ isActive: true })
    .select('uuid name durationMinutes price isActive')
    .sort({ createdAt: -1 })
    .lean()

  return docs.map(toPublicService)
}

/**
 * Admin-only listing: every Service, active AND inactive, newest first.
 *
 * Deliberately a separate function (and a separate route) from
 * `listActiveServices()` rather than the same one with a conditional filter —
 * a branch that decides whether inactive records are exposed is one
 * misconfiguration away from leaking them on the public path (plan 012, Open
 * Question 1).
 *
 * Soft-deleted (`deletedAt` set) documents are still excluded: that's the
 * schema hook's job and is not an admin-visible state.
 */
export async function listAllServices(): Promise<PublicService[]> {
  const docs = await Service.find({})
    .select('uuid name durationMinutes price isActive')
    .sort({ createdAt: -1 })
    .lean()

  return docs.map(toPublicService)
}

export interface CreateServiceInput {
  name: string
  durationMinutes: number
  price: number
}

/**
 * Creates a Service (PRD F6). `isActive` is NOT accepted from the caller — a
 * newly created treatment is always active; the schema default decides, not the
 * request body.
 */
export async function createService(input: CreateServiceInput): Promise<PublicService> {
  const created = await Service.create({
    name: input.name,
    durationMinutes: input.durationMinutes,
    price: input.price,
  })

  return toPublicService(created)
}

export interface UpdateServicePatch {
  name?: string
  durationMinutes?: number
  price?: number
  isActive?: boolean
}

/**
 * Applies a partial update to one Service by uuid (PRD F7).
 *
 * Only the fields explicitly present in `patch` are written — the `$set`
 * document is rebuilt field by field from a fixed allowlist, so no
 * attacker-supplied key (`deletedAt`, `uuid`, `$where`, ...) can ever reach the
 * update. This matters because `Service` is also read by the public,
 * unauthenticated Screen 1 (plan 012, Risks).
 *
 * `isActive` IS patchable here on purpose: it is how an admin reverses a
 * deactivation, without inventing a separate reactivate route (Open Question 3).
 *
 * Returns `null` when no live Service has that uuid — the caller maps that to a
 * 404.
 */
export async function updateService(
  id: string,
  patch: UpdateServicePatch,
): Promise<PublicService | null> {
  const $set: Record<string, unknown> = {}
  if (patch.name !== undefined) $set.name = patch.name
  if (patch.durationMinutes !== undefined) $set.durationMinutes = patch.durationMinutes
  if (patch.price !== undefined) $set.price = patch.price
  if (patch.isActive !== undefined) $set.isActive = patch.isActive

  // An empty patch is a no-op read: still resolve the document so the caller can
  // tell "nothing to change" (200) apart from "no such Service" (404).
  const updated = await Service.findOneAndUpdate(
    // `deletedAt: null` is repeated explicitly: the schema's soft-delete hook
    // covers find/findOne/countDocuments only, NOT findOneAndUpdate.
    { uuid: id, deletedAt: null },
    Object.keys($set).length > 0 ? { $set } : {},
    { new: true, runValidators: true },
  )
    .select('uuid name durationMinutes price isActive')
    .lean()

  return updated ? toPublicService(updated) : null
}

/**
 * Deactivates a Service (PRD F8) — a soft delete: `isActive` flips to false and
 * the document stays. This is a thin, intent-named wrapper over `updateService`
 * so there is exactly one write path for the Service resource.
 *
 * It deliberately does NOT cascade to the Service's TimeSlots or Appointments
 * (plan 012, Open Question 4): deactivation is a Screen-1 visibility change,
 * and appointments already made stay intact.
 */
export async function deactivateService(id: string): Promise<PublicService | null> {
  return updateService(id, { isActive: false })
}

// Maps a Service document to exactly the fields the contract's Service schema
// allows (additionalProperties: false) — `_id`, `__v`, `createdAt` and
// `deletedAt` are internal and never serialized. Done explicitly because
// `.lean()` bypasses the model's toJSON transform.
function toPublicService(doc: {
  uuid: string
  name: string
  durationMinutes: number
  price: number
  isActive: boolean
}): PublicService {
  return {
    id: doc.uuid,
    name: doc.name,
    durationMinutes: doc.durationMinutes,
    price: doc.price,
    isActive: doc.isActive,
  }
}
