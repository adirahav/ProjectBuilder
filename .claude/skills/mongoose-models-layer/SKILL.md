---
name: mongoose-models-layer
description: Use this skill when defining, extending, or querying any Mongoose model in any backend service. Covers schema definitions, the soft-delete pattern, required indexes, and sensitive-field stripping — the DB-side counterpart to state-management-layer's frontend rules.
references:
  - @.rule/database-rules.md
  - @.rule/naming-rules.md
  - @backend-service-layer/SKILL.md
  - @seat-concurrency-layer/SKILL.md
---

# Mongoose Models Layer
*Goal:* Keep every collection's shape, soft-delete behavior, and indexing consistent across all services, so no query anywhere in the codebase has to "remember" a rule that should be enforced by the schema itself.

**Core Principle:** A rule that must be repeated in every service function is a rule that will eventually be forgotten in one of them. Push soft-delete filtering, sensitive-field stripping, and enum validation into the schema — not into the callers.

## Which Models Live Where
- **`appointment-service`** owns `Service`, `TimeSlot`, `Appointment`.
- **`user-service`** owns `Admin`.
- No service ever imports or queries another service's models directly — cross-service data needs are stored as a plain `ObjectId`, not a live cross-database `ref` that gets populated, since separate services don't share a connection.

## Schema Definitions

```typescript
// backend/appointment-service/api/models/Service.model.ts
import { Schema, model } from 'mongoose'

const serviceSchema = new Schema({
  name: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  price: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  deactivatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
})

export const Service = model('Service', serviceSchema)
```

```typescript
// backend/appointment-service/api/models/Appointment.model.ts
import { Schema, model } from 'mongoose'

const appointmentSchema = new Schema({
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  timeSlotId: { type: Schema.Types.ObjectId, ref: 'TimeSlot', required: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
})

export const Appointment = model('Appointment', appointmentSchema)
```

```typescript
// backend/user-service/api/models/Admin.model.ts
import { Schema, model } from 'mongoose'

const adminSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

export const Admin = model('Admin', adminSchema)
```

`TimeSlot`'s schema is covered in `@seat-concurrency-layer/SKILL.md` and `@backend-service-layer/SKILL.md` — its `status` enum (`available`/`held`/`booked`) and indexes are the one part of the codebase with its own dedicated skill; don't duplicate that schema definition here.

## Soft Delete — Enforce It in the Schema, Not the Caller
`Appointment` is soft-deleted via its `status` field (`cancelled` instead of removal — no `deletedAt` field on this model). `Service` is soft-deleted via `isActive`/`deactivatedAt`. `TimeSlot` is not independently soft-deleted — its lifecycle is entirely its `status` field (`available`/`held`/`booked`), and `Admin` is never deleted at all in v1.

Don't rely on every service function remembering to filter these out — add a schema-level hook once, per soft-deleted model:

```typescript
// Service.model.ts — exclude deactivated services from default queries
function excludeDeactivated(this: any, next: () => void) {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.isActive === undefined) {
    this.where({ isActive: true })
  }
  next()
}

serviceSchema.pre('find', excludeDeactivated)
serviceSchema.pre('findOne', excludeDeactivated)
serviceSchema.pre('countDocuments', excludeDeactivated)
```

- The `PATCH /api/services/:id/deactivate` route calls `findOneAndUpdate({ uuid: id }, { isActive: false, deactivatedAt: new Date() })` — never `findByIdAndDelete`/`deleteOne`.
- The admin services list (Screen 7, `GET /api/services` admin-scoped) needs to see deactivated services too — query with an explicit `{ isActive: { $in: [true, false] } }` or `.setOptions({ skipSoftDeleteFilter: true })` rather than removing the hook; the public service list (Screen 1) always uses the default filtered query.
- `Appointment` has no equivalent hook — `cancelled` appointments are still real, informative rows in the admin dashboard (Screen 6), not hidden; nothing about `Appointment.status = cancelled` triggers exclusion from default queries.
- `TimeSlot` and `Admin` are excluded from this pattern entirely, as noted above.

## Sensitive Field Stripping
`Admin.passwordHash` must never be serialized into an API response. Enforce this in the schema's `toJSON`, not by remembering to `.select('-<field>')` on every query:

```typescript
adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})
```

## External Identity — `uuid`, never `_id`
Same principle as sensitive-field stripping, applied to identity: `_id` is an internal Mongo ObjectId used for refs and queries; it must never reach a client. Every model additionally carries a `uuid` field, which is what clients see as `id`. Add both the field and the `toJSON` transform to **every** model — don't rely on controllers to map it per response:

```typescript
import { randomUUID } from 'crypto'

const serviceSchema = new Schema({
  uuid: { type: String, default: randomUUID, unique: true, index: true },
  // ...rest of the fields
})

serviceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.uuid
    delete ret._id
    delete ret.uuid
    delete ret.__v
    return ret
  },
})
```

Combine this with any sensitive-field transform (both transforms run in the same `toJSON` function — don't register two separate ones).

**Client → server direction:** any client-supplied `id` in a URL param or request body is a `uuid`, not an ObjectId. Resolve it in the service layer (`Model.findOne({ uuid: id })`) before using it in any query or building a ref — never pass a client-supplied string straight into `findById`/`_id` filters.

**Embedded/lean responses:** `.lean()` queries bypass Mongoose document methods, including `toJSON` — if a service returns a `.lean()` result directly to a controller that serializes it, the `uuid`→`id` mapping and `_id` stripping must be done explicitly in the service (a small `toPublic()`-style helper), not assumed to happen automatically.

## Required Indexes
| Model | Index | Reason |
|---|---|---|
| `Service` | `{ uuid: 1 }` unique | client-facing id lookup |
| `Service` | `{ isActive: 1 }` | fast filtering of the public active-services list |
| `TimeSlot` | `{ uuid: 1 }` unique | client-facing id lookup |
| `TimeSlot` | `{ serviceId: 1, startsAt: 1 }` | listing available slots for a service on a date, sorted by time |
| `TimeSlot` | `{ status: 1 }` | the atomic claim filter (`status: 'available'`) in `seat-concurrency-layer` relies on this |
| `Appointment` | `{ uuid: 1 }` unique | client-facing id lookup |
| `Appointment` | `{ timeSlotId: 1 }` | releasing/looking up the appointment tied to a slot on cancel |
| `Appointment` | `{ status: 1, createdAt: 1 }` | admin dashboard date-filtered/status list view |
| `Admin` | `{ email: 1 }` unique | login lookup |

Define indexes directly on the schema (`schema.index({...})`), not via a separate manual `createIndex` script — so they're created automatically wherever the app connects (dev, test, prod), and they're visible next to the schema they belong to.

## Query Conventions
- Prefer `.lean()` for read-only queries that don't need Mongoose document methods — faster and avoids accidental mutation of a cached document.
- Never build a query filter from unvalidated client input directly (e.g. `Model.find(req.body)`) — this is a NoSQL-injection vector. Only pass through fields the route explicitly expects, each validated to its expected type.
- Population (`.populate()`) is fine within a single service's own models since they share a connection; never `.populate()` across a service boundary into another service's collection — fetch that data via that service's API if ever needed, not a cross-DB populate.

## Testing
- Use an in-memory or dedicated test MongoDB instance (see `.rule/testing-rules.md`) — never point tests at the real production cluster.
- Test the soft-delete hook itself once per model (a deleted document is excluded from `.find()`/`.findOne()` but still fetchable via an explicit override) — don't re-test it inside every unrelated service test.
- Test index uniqueness violations explicitly rather than assuming the index exists because it's declared in code.

## Implementation Checklist
- [ ] Every soft-deleted model has the `pre('find'/'findOne')` hook.
- [ ] Any model with a sensitive field strips it via `toJSON` transform — no query needs to remember `.select('-field')`.
- [ ] All required indexes (see table above) are declared on the schema, not created ad hoc.
- [ ] No query builds its filter directly from unvalidated `req.body`/`req.query`.
- [ ] No cross-service `.populate()` — services never query each other's collections.
- [ ] Every model has a `uuid` field and a `toJSON` transform that maps `uuid`→`id` and deletes `_id`/`__v` — no response anywhere exposes a raw `_id`.
- [ ] Any `.lean()` result that reaches a controller directly is mapped through an explicit `uuid`→`id` helper (lean bypasses `toJSON`).
- [ ] Every controller/service that receives a client-supplied `id` resolves it via `Model.findOne({ uuid: id })` before using it in a query or ref — never treats it as a raw `_id`.
