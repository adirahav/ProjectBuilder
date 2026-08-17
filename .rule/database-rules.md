# Database Rules

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: BookMe — appointment booking for a small clinic/salon (`booking-service` + `admin-service`), ports 4001/4002.

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of reference data (e.g. roles/permissions, if used). It never touches core business-entity data.

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail: used for cross-collection refs and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism used to strip any sensitive field — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections

### Service  *(owned by booking-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `durationMinutes` — Number, required
- `price` — Number, required
- `isActive` — Boolean, default: true
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

### Appointment  *(owned by booking-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `service` — ObjectId ref → Service, required
- `timeSlot` — ObjectId ref → TimeSlot, required
- `customerName` — String, required
- `customerPhone` — String, required if `customerEmail` absent
- `customerEmail` — String, required if `customerPhone` absent
- `status` — String, required, enum: `pending`, `confirmed`, `completed`, `cancelled`, default: `pending`
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

### TimeSlot  *(owned by booking-service — the contested entity)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `service` — ObjectId ref → Service, required
- `date` — Date, required
- `startTime` — String (e.g. `"14:30"`), required
- `status` — String, required, enum: `available`, `held`, `booked`, default: `available`
- `heldAt` — Date, default: null (used to expire a stale `held` slot back to `available`)
- `createdAt` — Date, default: Date.now

### Admin  *(owned by admin-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `username` — String, required, unique
- `passwordHash` — String, required
- `createdAt` — Date, default: Date.now

## Status Rules — TimeSlot (contested entity)
- `status` must always be one of `available`, `held`, `booked` — never store any other string.
- Valid transitions (enforced in `booking-service`'s `timeSlot.service.ts`, not just at the DB layer):
  - `available → held` — a customer starts a booking (Booking Form reached)
  - `held → booked` — the customer submits the Booking Form and the Appointment is created
  - `held → available` — the hold expires (`heldAt` older than the configured hold window) before the Appointment is submitted
  - `booked → available` — an admin cancels or reschedules the owning Appointment
- **Concurrency:** any transition away from `available` must use an atomic, condition-checked update (Mongoose `findOneAndUpdate({ _id, status: 'available' }, { $set: { status: 'held', heldAt: new Date() } })`) so two simultaneous requests for the same `TimeSlot` can't both succeed. Never read-then-write the status in two separate steps. See `seat-concurrency-layer` skill for the full pattern.

## Roles & Permissions
- Single authenticated role: `admin`. No permission matrix — a valid JWT with `role: admin` grants access to every admin-scoped route; there is no finer-grained permission model for v1.
- Public routes (Screens 1-4: browsing Services/TimeSlots, submitting a booking) require no auth at all.
- If a second admin-level role is introduced later, revisit this section to add a `roles` array and `<category>:<action>` permission keys rather than hardcoding a second boolean flag.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents, use a dedicated migration script.

## Bootstrap
- The seed script upserts reference data — core business-entity collections start empty and are created only through the app itself. `admin-service`'s seed script creates the single `Admin` account on first run if none exists.
- Required indexes: `Service.uuid` (unique), `Appointment.uuid` (unique), `TimeSlot.uuid` (unique), `TimeSlot.{service, date, status}` (compound, for the TimeSlot Picker query), `Admin.uuid` (unique), `Admin.username` (unique).

## Soft Delete
- Documents are never permanently deleted — set `deletedAt` to current timestamp, for `Service` and `Appointment`.
- All queries must filter: `{ deletedAt: null }`.
- Use Mongoose `pre('find')` middleware to exclude soft-deleted documents automatically.
- `TimeSlot` is excluded from soft-delete — its lifecycle is tracked entirely via `status`, not deletion; it's small, auto-generated schedule data with no independent history worth preserving after cancellation.
- `Admin` is excluded from soft-delete — a single admin-managed account record for v1, not user-facing data.

## Operational Notes
- Each service owns its own collections — `booking-service` owns `Service`/`TimeSlot`/`Appointment`; `admin-service` owns `Admin` only. `admin-service` never accesses `booking-service`'s collections directly — it calls `booking-service`'s admin-scoped HTTP API instead (see `.doc/architecture.md`).
- Do not store in-memory state between requests — especially `TimeSlot.status`, which must always be read from the DB, never cached in a way that could serve a stale value during a status check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- Exact hold-window duration for `TimeSlot.heldAt` before it reverts to `available` (also open in `.doc/architecture.md`).
- Whether a scheduled job or a lazy check-on-read expires stale `held` TimeSlots.
