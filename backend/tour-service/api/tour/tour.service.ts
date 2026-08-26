import { Tour } from '../models/Tour.model.js'
import type { HydratedDocument } from 'mongoose'

export type PublicTour = {
  id: string
  name: string
  startDate: string
  endDate: string | null
}

/** ISO-8601 calendar date (`YYYY-MM-DD`), which is what the contract specifies. */
function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null
  return value.toISOString().slice(0, 10)
}

function toPublicTour(doc: any): PublicTour {
  return {
    id: doc.uuid,
    name: doc.name,
    startDate: toIsoDate(doc.date) as string,
    endDate: toIsoDate(doc.endDate),
  }
}

/**
 * Soft-deleted tours are excluded by the schema hook, not by this filter — the
 * client has no delete flag to filter on, so they must never reach it.
 * Sorted by departure date so the selector ordering is stable and does not
 * depend on insertion order.
 */
export async function listTours(): Promise<PublicTour[]> {
  const tours = await Tour.find({}).sort({ date: 1 }).lean()
  // `.lean()` bypasses the toJSON transform, so the uuid → id mapping is done
  // explicitly here (mongoose-models-layer skill).
  return tours.map(toPublicTour)
}

/** Resolves a client-facing uuid to the document. Never treat an `id` as an `_id`. */
export async function findTourByUuid(uuid: string): Promise<HydratedDocument<any> | null> {
  return Tour.findOne({ uuid })
}
