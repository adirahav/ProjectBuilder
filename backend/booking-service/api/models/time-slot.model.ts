import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'

// The three states a slot can be in (.rule/database-rules.md "TimeSlot.status").
export const TIME_SLOT_STATUSES = ['open', 'held', 'booked'] as const
export type TimeSlotStatus = (typeof TIME_SLOT_STATUSES)[number]

// The TimeSlot collection — one bookable window for a Service on a given day.
//
// NOTE on shape: .rule/database-rules.md sketches this entity as `startsAt` /
// `endsAt` Date fields, but the API contract for this service specifies a plain
// calendar `date` (YYYY-MM-DD) plus wall-clock `startTime` / `endTime` (HH:mm),
// and states explicitly that the day is "never a UTC instant, so the day can
// never shift under a client". Storing instants would reintroduce exactly the
// timezone drift the contract forbids, so the contract's shape wins here. This
// divergence is deliberate and is flagged in the agent report.
const timeSlotSchema = new Schema(
  {
    // The only identity a client ever sees, exposed as `id` by the toJSON
    // transform below. `_id` stays internal (database-rules "External Identity").
    uuid: { type: String, default: randomUUID, unique: true, index: true },
    // Internal ObjectId ref — a client always addresses a Service by its uuid,
    // which is resolved to this _id before it ever reaches a query filter.
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    // Calendar day in the clinic's local timezone, as a literal YYYY-MM-DD.
    date: { type: String, required: true },
    // Wall-clock 24h HH:mm. Rendered verbatim by the client, never re-parsed.
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    // Server-controlled ONLY. Never assigned from a request body — the endpoint
    // that was called determines the resulting status.
    status: { type: String, required: true, enum: TIME_SLOT_STATUSES, default: 'open' },
    // When the current hold started, used to expire stale holds. Server-side
    // bookkeeping — deliberately never serialized to a client.
    heldAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: '__v' },
)

// Compound index for the availability query (database-rules "Bootstrap").
timeSlotSchema.index({ serviceId: 1, status: 1 })
// The list endpoint always filters by service + day, so index that pair too.
timeSlotSchema.index({ serviceId: 1, date: 1 })

// A TimeSlot is deliberately NOT soft-deleted (database-rules "Soft Delete"):
// its `status` alone governs availability, so there is no deletedAt hook here.

// External identity: `uuid` -> `id`; `_id`/`__v` and the internal `heldAt`
// bookkeeping are never serialized.
timeSlotSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = ret.uuid
    delete ret._id
    delete ret.uuid
    delete ret.__v
    delete ret.heldAt
    return ret
  },
})

export type TimeSlotDoc = InferSchemaType<typeof timeSlotSchema>

export const TimeSlot = model('TimeSlot', timeSlotSchema)
