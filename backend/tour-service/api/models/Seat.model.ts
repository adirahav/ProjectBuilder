import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { publicIdTransform } from './softDelete.js'

/** The four — and only four — seat statuses (.rule/naming-rules.md). */
export const SEAT_STATUSES = ['available', 'pending', 'taken', 'reserved'] as const
export type SeatStatus = (typeof SEAT_STATUSES)[number]

const positionSchema = new Schema(
  {
    row: { type: Number, required: true, min: 1 },
    column: { type: Number, required: true, min: 1 },
    // A string rather than a number, so labels like `12A` stay valid.
    label: { type: String, required: true },
  },
  { _id: false }
)

const seatSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  busId: { type: Schema.Types.ObjectId, ref: 'Bus', required: true, index: true },
  position: { type: positionSchema, required: true },
  status: { type: String, required: true, enum: SEAT_STATUSES, default: 'available' },
  // PII — persisted here, never serialized by any public endpoint.
  passengerName: { type: String, default: null },
  passengerPhone: { type: String, default: null },
  pickupPointName: { type: String, default: null },
  requestedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  assignedBy: { type: String, default: null }, // Admin uuid, set on manual-assign
  createdAt: { type: Date, default: Date.now },
  // Seat is NOT soft-deleted: it is created with and belongs to its parent Bus
  // (.rule/database-rules.md "Soft Delete").
})

seatSchema.index({ busId: 1, status: 1 })

seatSchema.set('toJSON', { transform: publicIdTransform })

export type SeatDoc = InferSchemaType<typeof seatSchema>
export const Seat = model('Seat', seatSchema)
