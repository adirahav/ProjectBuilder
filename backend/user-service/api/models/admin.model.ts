import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

// The single v1 Admin account (see .rule/database-rules.md). Not soft-deleted:
// there is exactly one, permanent account, created by api/scripts/seedAdmin.ts.
const adminSchema = new Schema({
  uuid: { type: String, default: randomUUID, unique: true, index: true },
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
