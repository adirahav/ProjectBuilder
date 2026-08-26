import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { excludeDeleted, publicIdTransform } from './softDelete.js'

/**
 * Pickup points are embedded on the bus document — there is no separate
 * collection (plan 007, Open Question 4). `order` fixes the dropdown ordering
 * so it never depends on insertion order.
 */
const pickupPointSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true },
  },
  { _id: false }
)

/**
 * Bus-level layout metadata driving the rendered seat map. Every field is
 * optional: a null disables that affordance rather than breaking the render.
 */
const seatLayoutSchema = new Schema(
  {
    aisleAfterColumn: { type: Number, default: null, min: 0 },
    doorRow: { type: Number, default: null, min: 1 },
    backRow: { type: Number, default: null, min: 1 },
  },
  { _id: false }
)

const busSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  tourId: { type: Schema.Types.ObjectId, ref: 'Tour', required: true, index: true },
  name: { type: String, required: true, trim: true },
  seatCount: { type: Number, required: true, min: 1 },
  seatLayout: { type: seatLayoutSchema, default: () => ({}) },
  pickupPoints: { type: [pickupPointSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // soft-deleted
})

busSchema.index({ deletedAt: 1 })

busSchema.pre('find', excludeDeleted)
busSchema.pre('findOne', excludeDeleted)
busSchema.pre('countDocuments', excludeDeleted)

busSchema.set('toJSON', { transform: publicIdTransform })

export type BusDoc = InferSchemaType<typeof busSchema>
export const Bus = model('Bus', busSchema)
