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

  return docs.map((doc) => ({
    id: doc.uuid,
    name: doc.name,
    durationMinutes: doc.durationMinutes,
    price: doc.price,
    isActive: doc.isActive,
  }))
}
