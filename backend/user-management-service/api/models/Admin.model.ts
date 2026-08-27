import { Schema, model, type InferSchemaType } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { excludeDeleted, publicIdTransform } from './softDelete.js'

/**
 * `admin` is the canonical entity name for the only entity with login
 * credentials (.rule/naming-rules.md, .rule/glossary.md) — `roles` is what
 * distinguishes an `admin`-level account from a `user`-level one, not the
 * collection name. Passengers are never persisted as accounts at all.
 *
 * Deviation from `.rule/database-rules.md`'s `admin` collection: that document
 * lists a required, unique `username`. The API contract
 * (`api-contract.user-management-service.yaml`) supersedes it — signup accepts
 * `fullName` and the login identifier is `email` ("the model has no separate
 * `username` field", plan 006 Open Question 3). A unique index on a human
 * display name would also reject two legitimately identically-named people.
 * So: `fullName` is required but NOT unique; `email` carries the unique index.
 */
const adminSchema = new Schema({
  // Wrapped, never `default: randomUUID` — Mongoose calls default functions
  // with an argument on some paths (upserts), which randomUUID throws on.
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  fullName: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    // Uniqueness is enforced by this index at the DATABASE level, not only by
    // the application-level pre-check in admin.service.ts. The contract
    // requires this so two concurrent signups with the same email cannot both
    // succeed (the loser hits duplicate-key error 11000 → 409).
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
  },
  // Never serialized to a client — stripped in the toJSON transform below.
  passwordHash: { type: String, required: true },
  roles: {
    type: [String],
    enum: ['admin', 'user'],
    default: ['user'],
  },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // soft delete — account deactivation
})

adminSchema.index({ deletedAt: 1 })

adminSchema.pre('find', excludeDeleted)
adminSchema.pre('findOne', excludeDeleted)
adminSchema.pre('countDocuments', excludeDeleted)

adminSchema.set('toJSON', {
  transform(doc: unknown, ret: Record<string, any>) {
    const out = publicIdTransform(doc, ret)
    // Defense in depth: the response serializer in admin.service.ts already
    // whitelists fields, but stripping the hash at the schema level means no
    // future caller can leak it by accidentally returning a raw document.
    delete out.passwordHash
    return out
  },
})

export type AdminDoc = InferSchemaType<typeof adminSchema>
export const Admin = model('Admin', adminSchema)
