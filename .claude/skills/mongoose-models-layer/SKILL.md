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
- `booking-service` owns `Service`, `TimeSlot`, `Appointment`.
- `admin-service` owns `Admin`.
- No service ever imports or queries another service's models directly — cross-service data needs are stored as a plain `ObjectId`, not a live cross-database `ref` that gets populated, since separate services don't share a connection.

## Schema Definitions

```typescript
// backend/<service>/src/models/<Model>.ts — repeat this pattern per model: Service, Appointment (booking-service); Admin (admin-service)
import { Schema, model } from 'mongoose'

const exampleSchema = new Schema({
  // ...domain fields per model...
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }, // omit for TimeSlot and Admin — see Soft Delete below
})

export const Example = model('Example', exampleSchema)
```

`TimeSlot`'s schema is covered in `@seat-concurrency-layer/SKILL.md` and `@backend-service-layer/SKILL.md` — its status enum and indexes are the one part of the codebase with its own dedicated skill; don't duplicate that schema definition here.

## Soft Delete — Enforce It in the Schema, Not the Caller
`Service` and `Appointment` are soft-deleted. `TimeSlot` and `Admin` are not (see `.rule/database-rules.md` for why). Don't rely on every service function remembering to add `{ deletedAt: null }` — add a schema-level hook once, per soft-deleted model:

```typescript
// applies to every soft-deleted model — add this block to each
function excludeDeleted(this: any, next: () => void) {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.deletedAt === undefined) {
    this.where({ deletedAt: null })
  }
  next()
}

exampleSchema.pre('find', excludeDeleted)
exampleSchema.pre('findOne', excludeDeleted)
exampleSchema.pre('countDocuments', excludeDeleted)
```

- A `DELETE` route calls `findByIdAndUpdate(id, { deletedAt: new Date() })` — never `findByIdAndDelete`/`deleteOne`.
- If a service genuinely needs to see soft-deleted records (e.g. an admin "show archived" view), query with an explicit `{ deletedAt: { $ne: null } }` or `.setOptions({ skipSoftDeleteFilter: true })` rather than removing the hook.
- Any model excluded from soft-delete (e.g. a child entity deleted/recreated with its parent) should say so explicitly here rather than silently lacking the hook.

## Sensitive Field Stripping
`Admin.passwordHash` must never be serialized into an API response. Enforce this in the schema's `toJSON`, not by remembering to `.select('-<field>')` on every query:

```typescript
exampleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.sensitiveField
    return ret
  },
})
```

## External Identity — `uuid`, never `_id`
Same principle as sensitive-field stripping, applied to identity: `_id` is an internal Mongo ObjectId used for refs and queries; it must never reach a client. Every model additionally carries a `uuid` field, which is what clients see as `id`. Add both the field and the `toJSON` transform to **every** model — don't rely on controllers to map it per response:

```typescript
import { randomUUID } from 'crypto'

const exampleSchema = new Schema({
  uuid: { type: String, default: randomUUID, unique: true, index: true },
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

Combine this with any sensitive-field transform (both transforms run in the same `toJSON` function — don't register two separate ones).

**Client → server direction:** any client-supplied `id` in a URL param or request body is a `uuid`, not an ObjectId. Resolve it in the service layer (`Model.findOne({ uuid: id })`) before using it in any query or building a ref — never pass a client-supplied string straight into `findById`/`_id` filters.

**Embedded/lean responses:** `.lean()` queries bypass Mongoose document methods, including `toJSON` — if a service returns a `.lean()` result directly to a controller that serializes it, the `uuid`→`id` mapping and `_id` stripping must be done explicitly in the service (a small `toPublic()`-style helper), not assumed to happen automatically.

## Required Indexes
| Model | Index | Reason |
|---|---|---|
| `Service` | `uuid` (unique) | Client identity lookup |
| `Appointment` | `uuid` (unique) | Client identity lookup |
| `TimeSlot` | `uuid` (unique) | Client identity lookup |
| `TimeSlot` | `{ service, date, status }` (compound) | TimeSlot Picker query — available slots for a service on a date |
| `Admin` | `uuid` (unique) | Client identity lookup |
| `Admin` | `username` (unique) | Login lookup |

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
