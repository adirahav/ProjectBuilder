import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { excludeDeleted, publicIdTransform } from './softDelete.js'

const tourSchema = new Schema({
  // Wrapped, never `default: randomUUID` — Mongoose calls default functions
  // with an argument on some paths (upserts), which randomUUID throws on.
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  name: { type: String, required: true, trim: true },
  // `date` is the tour's departure date (.rule/database-rules.md); it is
  // serialized to clients as `startDate` per the API contract.
  date: { type: Date, required: true },
  endDate: { type: Date, default: null },
  description: { type: String, default: '' },
  createdBy: { type: String, default: null }, // Admin uuid — opaque, never a live cross-service ref
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // soft-deleted
})

tourSchema.index({ deletedAt: 1 })

tourSchema.pre('find', excludeDeleted)
tourSchema.pre('findOne', excludeDeleted)
tourSchema.pre('countDocuments', excludeDeleted)

tourSchema.set('toJSON', { transform: publicIdTransform })

export type TourDoc = InferSchemaType<typeof tourSchema>
export const Tour = model('Tour', tourSchema)
