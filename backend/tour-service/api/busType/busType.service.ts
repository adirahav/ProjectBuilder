import { BusType } from '../models/BusType.model.js'

/**
 * No busType endpoint exists in the current API contract — busType CRUD is the
 * Tab 4b ticket. This module exists only so the seed script can upsert the
 * default template as reference data (.rule/database-rules.md "Bootstrap"),
 * and so the `isDefault` invariant lives in the service layer from day one.
 *
 * Exactly one busType may have `isDefault: true`.
 */
export async function upsertDefaultBusType(template: {
  rows: number
  doorRowPosition: number
  backRowSeatCount: number
}) {
  const existing = await BusType.findOne({ isDefault: true })

  if (existing) {
    existing.set(template)
    await existing.save()
    return existing
  }

  return BusType.create({ ...template, isDefault: true })
}
