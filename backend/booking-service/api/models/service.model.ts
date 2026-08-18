import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'

// The Service collection — a treatment the clinic offers.
// Shape is fixed by .rule/database-rules.md ("Core Collections > Service").
const serviceSchema = new Schema(
  {
    // The only identity a client ever sees, exposed as `id` by the toJSON
    // transform below. `_id` stays internal (database-rules "External Identity").
    uuid: { type: String, default: randomUUID, unique: true, index: true },
    name: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    price: { type: Number, required: true },
    // Soft-delete flag: a deactivated Service is never hard-deleted, and must
    // never appear on the customer-facing list (PRD AC-4).
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { versionKey: '__v' },
)

// Soft-delete enforced at the schema level, so no caller has to remember it.
// An explicit `deletedAt` in the filter opts out (e.g. a future admin
// "show archived" view).
function excludeDeleted(this: any, next: () => void) {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.deletedAt === undefined) {
    this.where({ deletedAt: null })
  }
  next()
}

serviceSchema.pre('find', excludeDeleted)
serviceSchema.pre('findOne', excludeDeleted)
serviceSchema.pre('countDocuments', excludeDeleted)

// External identity: `uuid` -> `id`, and `_id`/`__v` are never serialized.
serviceSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = ret.uuid
    delete ret._id
    delete ret.uuid
    delete ret.__v
    return ret
  },
})

export type ServiceDoc = InferSchemaType<typeof serviceSchema>

export const Service = model('Service', serviceSchema)
