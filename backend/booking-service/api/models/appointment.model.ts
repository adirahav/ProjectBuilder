import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'

// The three states an Appointment can be in (.rule/database-rules.md).
// A Customer only ever creates `pending`; `confirmed`/`cancelled` are the
// Admin's decision alone (PRD F9-F11) and belong to the Admin routes.
export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

// The Appointment collection — a Customer's booking of a Service at a TimeSlot.
//
// This record holds personally identifiable contact details, so the toJSON
// transform below is deliberately strict: only the fields the API contract's
// Appointment schema allows (additionalProperties: false) survive it.
const appointmentSchema = new Schema(
  {
    // The only identity a client ever sees, exposed as `id` by the toJSON
    // transform below. `_id` stays internal (database-rules "External Identity").
    uuid: { type: String, default: randomUUID, unique: true, index: true },
    // Internal ObjectId refs. A client always addresses these by uuid, which is
    // resolved to an _id before it ever reaches a query filter.
    //
    // `serviceId` is derived server-side from the TimeSlot document, never
    // copied from the request body — the body's serviceId is a cross-check only.
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    timeSlotId: { type: Schema.Types.ObjectId, ref: 'TimeSlot', required: true },
    // Attacker-controlled free text. Stored verbatim, never interpolated into a
    // query or a notification template without escaping.
    customerName: { type: String, required: true, maxlength: 60 },
    // As typed — formatting characters are permitted, this is not a normalized
    // key, the clinic simply dials it.
    customerPhone: { type: String, required: true, maxlength: 20 },
    // Optional by design (PRD F4): a Customer without email can still book.
    // Absent — never an empty string — when not supplied.
    customerEmail: { type: String, maxlength: 254 },
    // Server-controlled. Always created `pending`; never assigned from a body.
    status: { type: String, required: true, enum: APPOINTMENT_STATUSES, default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { versionKey: '__v' },
)

// The Admin list (F9-F11) will query by slot and by status.
appointmentSchema.index({ timeSlotId: 1 })
appointmentSchema.index({ serviceId: 1, status: 1 })

// Soft-delete enforced at the schema level, so no caller has to remember it.
// An explicit `deletedAt` in the filter opts out.
function excludeDeleted(this: any, next: () => void) {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.deletedAt === undefined) {
    this.where({ deletedAt: null })
  }
  next()
}

appointmentSchema.pre('find', excludeDeleted)
appointmentSchema.pre('findOne', excludeDeleted)
appointmentSchema.pre('countDocuments', excludeDeleted)

// External identity: `uuid` -> `id`; `_id`/`__v` and the internal audit fields
// are never serialized to a Customer.
appointmentSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = ret.uuid
    delete ret._id
    delete ret.uuid
    delete ret.__v
    delete ret.createdAt
    delete ret.deletedAt
    return ret
  },
})

export type AppointmentDoc = InferSchemaType<typeof appointmentSchema>

export const Appointment = model('Appointment', appointmentSchema)
