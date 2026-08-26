import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { publicIdTransform } from './softDelete.js'

/**
 * A reusable seat-grid template. No endpoint in the current API contract reads
 * or writes it — busType CRUD is the Tab 4b ticket — but the model and its
 * default row exist so the seed script can bootstrap reference data
 * (.rule/database-rules.md "Bootstrap").
 *
 * Not soft-deleted: small admin-managed reference data, hard delete is safe.
 */
const busTypeSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  rows: { type: Number, required: true },
  doorRowPosition: { type: Number, required: true },
  backRowSeatCount: { type: Number, required: true },
  manuallyBlockedSeats: { type: [String], default: [] },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

busTypeSchema.index({ isDefault: 1 })

busTypeSchema.set('toJSON', { transform: publicIdTransform })

export type BusTypeDoc = InferSchemaType<typeof busTypeSchema>
export const BusType = model('BusType', busTypeSchema)
