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
*Goal:* Keep every collection's shape, soft-delete behavior, and indexing consistent across both services, so no query anywhere in the codebase has to "remember" a rule that should be enforced by the schema itself.

**Core Principle:** A rule that must be repeated in every service function is a rule that will eventually be forgotten in one of them. Push soft-delete filtering, sensitive-field stripping, and enum validation into the schema — not into the callers.

## Which Models Live Where
- **`tour-service`** owns `Tour`, `Bus`, `BusType`, `Seat`.
- **`user-management-service`** owns `Admin`.
- No service ever imports or queries another service's models directly — cross-service data needs are stored as a plain `ObjectId`, not a live cross-database `ref` that gets populated, since separate services don't share a connection. (In practice no cross-service ref exists in v1 — `Admin` is only referenced by `tour.createdBy`/`seat.assignedBy` as an opaque `uuid` string, never a live `ref`.)

## Schema Definitions

```typescript
// backend/tour-service/api/models/Tour.model.ts
import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

const tourSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  name: { type: String, required: true },
  date: { type: Date, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true }, // Admin's uuid, opaque reference — not a live ref
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // soft-deleted
})

export const Tour = model('Tour', tourSchema)
```

```typescript
// backend/tour-service/api/models/Bus.model.ts
import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

const pickupPointSchema = new Schema(
  { name: { type: String, required: true }, order: { type: Number, required: true } },
  { _id: false }
)

const busSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  tourId: { type: Schema.Types.ObjectId, ref: 'Tour', required: true }, // same-service ref, fine
  name: { type: String, required: true },
  seatCount: { type: Number, required: true },
  doorPosition: { type: String, required: true },
  driverSide: { type: String, required: true },
  pickupPoints: { type: [pickupPointSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // soft-deleted
})

export const Bus = model('Bus', busSchema)
```

```typescript
// backend/tour-service/api/models/BusType.model.ts
import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

const busTypeSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  rows: { type: Number, required: true },
  doorRowPosition: { type: Number, required: true },
  backRowSeatCount: { type: Number, required: true },
  manuallyBlockedSeats: { type: [String], default: [] },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  // Not soft-deleted — see "Soft Delete" section below.
})

export const BusType = model('BusType', busTypeSchema)
```

```typescript
// backend/user-management-service/api/models/Admin.model.ts
import { Schema, model } from 'mongoose'
import { randomUUID } from 'crypto'

const adminSchema = new Schema({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true }, // stripped in toJSON — see below
  roles: { type: [String], enum: ['admin', 'user'], default: ['user'] },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // soft-deleted
})

export const Admin = model('Admin', adminSchema)
```

`Seat`'s schema is covered in `@seat-concurrency-layer/SKILL.md` and `@backend-service-layer/SKILL.md` — its `status` enum and indexes are the one part of the codebase with its own dedicated skill; don't duplicate that schema definition here.

## Soft Delete — Enforce It in the Schema, Not the Caller
`Tour` and `Bus` are soft-deleted. `BusType`, `Seat`, and `Admin` are **not** soft-deleted:
- `BusType` — a small, admin-managed reference/template collection; deleting a template that's already in use doesn't retroactively change any bus built from it, so hard delete is safe.
- `Seat` — belongs to and is created/destroyed with its parent `Bus`; never independently deleted.
- `Admin` — kept soft-deleted for audit/history of who created what (`tour.createdBy`, `seat.assignedBy` reference an `Admin`'s `uuid`); actually, treat `Admin` as soft-deleted (`deletedAt`) so those historical references never dangle.

Don't rely on every service function remembering to add `{ deletedAt: null }`. Add a schema-level hook once, per soft-deleted model (`Tour`, `Bus`, `Admin`):

```typescript
// applies to every soft-deleted model — add this block to each
function excludeDeleted(this: any, next: () => void) {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.deletedAt === undefined) {
    this.where({ deletedAt: null })
  }
  next()
}

tourSchema.pre('find', excludeDeleted)
tourSchema.pre('findOne', excludeDeleted)
tourSchema.pre('countDocuments', excludeDeleted)
```

- A `DELETE` route on `Tour`/`Bus` calls `findByIdAndUpdate(id, { deletedAt: new Date() })` — never `findByIdAndDelete`/`deleteOne`.
- If a service genuinely needs to see soft-deleted records (e.g. an admin "show archived" view), query with an explicit `{ deletedAt: { $ne: null } }` or `.setOptions({ skipSoftDeleteFilter: true })` rather than removing the hook.
- `BusType` and `Seat` are excluded from soft-delete for the reasons stated above.

## Sensitive Field Stripping
`Admin.passwordHash` must never be serialized into an API response. Enforce this in the schema's `toJSON`, not by remembering to `.select('-passwordHash')` on every query:

```typescript
adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})
```

## External Identity — `uuid`, never `_id`
Same principle as sensitive-field stripping, applied to identity: `_id` is an internal Mongo ObjectId used for refs and queries; it must never reach a client. Every model additionally carries a `uuid` field, which is what clients see as `id`. Add both the field and the `toJSON` transform to **every** model (`Tour`, `Bus`, `BusType`, `Seat`, `Admin`) — don't rely on controllers to map it per response:

```typescript
import { randomUUID } from 'crypto'

const exampleSchema = new Schema({
  // Wrapped, not passed directly (`default: randomUUID`) — Mongoose calls
  // schema `default` functions with an argument in some code paths (e.g. an
  // upsert), which `crypto.randomUUID()` then tries to use as its `options`
  // param and throws on: "The 'options' argument must be of type object.
  // Received null." Always wrap it, on every model.
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  // ...rest of the fields
})

exampleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.uuid
    delete ret._id
    delete ret.uuid
    delete ret.__v
    return ret
  },
})
```

Combine this with any sensitive-field transform (both transforms run in the same `toJSON` function — don't register two separate ones; `Admin`'s `toJSON` strips both `passwordHash` and `_id`/`uuid` in one function).

**Client → server direction:** any client-supplied `id` in a URL param or request body (e.g. `:busId`, `busTypeId` on bus creation) is a `uuid`, not an ObjectId. Resolve it in the service layer (`Model.findOne({ uuid: id })`) before using it in any query or building a ref — never pass a client-supplied string straight into `findById`/`_id` filters.

**Embedded/lean responses:** `.lean()` queries bypass Mongoose document methods, including `toJSON` — if a service returns a `.lean()` result directly to a controller that serializes it (e.g. the manifest report or the live seat map, both read-heavy), the `uuid`→`id` mapping and `_id`/`passwordHash` stripping must be done explicitly in the service (a small `toPublic()`-style helper), not assumed to happen automatically.

## Required Indexes
| Model | Index | Reason |
|---|---|---|
| `Tour` | `{ uuid: 1 }` unique | identity lookup |
| `Tour` | `{ deletedAt: 1 }` | soft-delete filtering |
| `Bus` | `{ uuid: 1 }` unique | identity lookup |
| `Bus` | `{ tourId: 1 }` | listing buses per tour |
| `Bus` | `{ deletedAt: 1 }` | soft-delete filtering |
| `BusType` | `{ uuid: 1 }` unique | identity lookup |
| `BusType` | `{ isDefault: 1 }` | enforcing/finding the single default template |
| `Seat` | `{ uuid: 1 }` unique | identity lookup |
| `Seat` | `{ busId: 1 }` | loading a bus's live seat map |
| `Seat` | `{ busId: 1, status: 1 }` | manifest filtering by status, seat-map queries |
| `Admin` | `{ uuid: 1 }` unique | identity lookup |
| `Admin` | `{ username: 1 }` unique | login lookup |
| `Admin` | `{ email: 1 }` unique | signup uniqueness check |

Define indexes directly on the schema (`schema.index({...})`), not via a separate manual `createIndex` script — so they're created automatically wherever the app connects (dev, test, prod), and they're visible next to the schema they belong to.

## Query Conventions
- Prefer `.lean()` for read-only queries that don't need Mongoose document methods (e.g. the seat map GET, the manifest report) — faster and avoids accidental mutation of a cached document.
- Never build a query filter from unvalidated client input directly (e.g. `Model.find(req.body)`) — this is a NoSQL-injection vector. Only pass through fields the route explicitly expects, each validated to its expected type.
- Population (`.populate()`) is fine within `tour-service`'s own models (`Bus.populate('tourId')`) since they share a connection; never `.populate()` across the service boundary into `user-management-service`'s `Admin` collection — fetch that data via that service's API if ever needed, not a cross-DB populate.

## Testing
- Use an in-memory or dedicated test MongoDB instance (see `.rule/testing-rules.md`) — never point tests at the real production cluster.
- Test the soft-delete hook itself once per soft-deleted model (`Tour`, `Bus`, `Admin`) — a deleted document is excluded from `.find()`/`.findOne()` but still fetchable via an explicit override — don't re-test it inside every unrelated service test.
- Test index uniqueness violations explicitly (e.g. duplicate `username`/`email` on `Admin`) rather than assuming the index exists because it's declared in code.

## Implementation Checklist
- [ ] `Tour`, `Bus`, and `Admin` have the `pre('find'/'findOne')` soft-delete hook; `BusType` and `Seat` intentionally do not.
- [ ] `Admin` strips `passwordHash` via `toJSON` transform — no query needs to remember `.select('-passwordHash')`.
- [ ] All required indexes (see table above) are declared on the schema, not created ad hoc.
- [ ] No query builds its filter directly from unvalidated `req.body`/`req.query`.
- [ ] No cross-service `.populate()` — `tour-service` never queries `user-management-service`'s `Admin` collection directly.
- [ ] Every model has a `uuid` field and a `toJSON` transform that maps `uuid`→`id` and deletes `_id`/`__v` — no response anywhere exposes a raw `_id`.
- [ ] `uuid`'s default is `() => randomUUID()`, never the bare `randomUUID` function reference.
- [ ] Any `.lean()` result that reaches a controller directly (seat map, manifest) is mapped through an explicit `uuid`→`id` helper (lean bypasses `toJSON`).
- [ ] Every controller/service that receives a client-supplied `id` resolves it via `Model.findOne({ uuid: id })` before using it in a query or ref — never treats it as a raw `_id`.
