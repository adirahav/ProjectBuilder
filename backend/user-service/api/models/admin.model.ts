import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

// Admin/staff accounts (see .rule/database-rules.md). Not soft-deleted.
// The first account is provisioned by api/scripts/seedAdmin.ts; further ones
// are created by an already-signed-in Admin via POST /api/auth/register
// (PRD F12, Screen 8). There is no self-service sign-up.
const adminSchema = new Schema({
  uuid: { type: String, default: randomUUID, unique: true, index: true },
  // Collected by F12 so colleagues can be told apart by something friendlier
  // than an email address. `required` is enforced on the register path; the
  // seed script supplies one too, so every account on record has a name.
  name: { type: String, required: true },
  // Stored already trimmed and lower-cased by the write paths, so the unique
  // index doubles as a case-insensitive uniqueness guarantee — "Dana@x.com"
  // and "dana@x.com" cannot become two accounts.
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

// One transform handles BOTH concerns, per mongoose-models-layer:
//  - identity: expose `uuid` as `id`, never leak Mongo's `_id`
//  - secrets: `passwordHash` must never be serialized into any response
// Enforcing it here means no controller has to remember `.select('-passwordHash')`.
adminSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = ret.uuid
    delete ret.uuid
    delete ret._id
    delete ret.__v
    delete ret.passwordHash
    return ret
  },
})

export const Admin = model('Admin', adminSchema)
