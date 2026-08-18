# Database Rules

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: Dog Grooming Clinic Booking — a self-service appointment booking system for a small dog grooming clinic (customers book grooming services against live time-slot availability; the clinic owner manages services and appointments).

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of reference data (e.g. an initial `Admin` account for local dev). It never touches core business-entity data (`Service`, `TimeSlot`, `Appointment`).

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail: used for cross-collection refs and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism used to strip any sensitive field — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections

### Service  *(owned by appointment-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `durationMinutes` — Number, required
- `price` — Number, required
- `isActive` — Boolean, default: `true` (soft delete)
- `deactivatedAt` — Date, default: null (soft delete)
- `createdAt` — Date, default: Date.now

### TimeSlot  *(owned by appointment-service — contested entity)*
- `_id` — ObjectId (auto-generated, internal only)
- `uuid` — String (auto-generated, unique, indexed)
- `serviceId` — ObjectId, ref `Service`, required
- `startsAt` — Date, required
- `endsAt` — Date, required
- `status` — String, required, enum: `available` | `held` | `booked`, default: `available`
- `createdAt` — Date, default: Date.now
- Not independently soft-deleted — a `TimeSlot`'s lifecycle is entirely expressed through `status`; it is never removed once created (see Status Rules below).

### Appointment  *(owned by appointment-service)*
- `_id` — ObjectId (auto-generated, internal only)
- `uuid` — String (auto-generated, unique, indexed)
- `serviceId` — ObjectId, ref `Service`, required
- `timeSlotId` — ObjectId, ref `TimeSlot`, required
- `customerName` — String, required
- `customerPhone` — String, required
- `status` — String, required, enum: `pending` | `confirmed` | `cancelled` | `completed`, default: `pending`
- `createdAt` — Date, default: Date.now
- Soft-deleted via `status: 'cancelled'`, not `deletedAt` — see Soft Delete section below.

### Admin  *(owned by user-service)*
- `_id` — ObjectId (auto-generated, internal only)
- `uuid` — String (auto-generated, unique, indexed)
- `email` — String, required, unique, indexed
- `passwordHash` — String, required (never returned in any API response — strip in the `toJSON` transform)
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

## Status Rules — TimeSlot (contested entity)
- `status` must always be one of `available` | `held` | `booked` — never store any other string.
- Valid transitions (enforced in `appointment-service`'s `timeslot.service.ts`, not just at the DB layer):
  - `available → held` — a `Customer` starts a booking transaction for this `TimeSlot`.
  - `held → booked` — the `Appointment` (status `pending`) is committed atomically with the `TimeSlot` claim.
  - `held → available` — the hold expires (timeout) or the booking transaction fails/aborts.
  - `booked → available` — the owning `Appointment` is cancelled.
- **Concurrency:** any transition away from `available` must use an atomic, condition-checked update (Mongoose `findOneAndUpdate({ _id, status: 'available' }, { $set: { status: 'held', ... } })`) so two simultaneous booking attempts for the same `TimeSlot` can't both succeed. Never read-then-write `status` in two separate steps. See `.claude/skills/seat-concurrency-layer/SKILL.md` (kept and adapted for `TimeSlot` — the naming there still says "seat" internally in places, but the pattern applies verbatim to `TimeSlot`) for the full pattern.
- `Appointment.status` transitions (`pending → confirmed`, `pending/confirmed → cancelled`, `confirmed → completed`) are simpler admin/system actions and don't need the same atomic-claim treatment, but must still go through the owning service's `appointment.service.ts`, never a direct client-supplied `status` write.

## Roles & Permissions
- Only one authenticated role exists: `Admin` (the clinic owner). There is no multi-role RBAC in v1 — every route is either `public` (booking flow: list services, list time slots, create/view an appointment by id) or `admin-only` (service management, appointment management dashboard).
- `Admin` has full access to all `Service`, `TimeSlot`, and `Appointment` records — no per-admin data partitioning (single clinic).
- `Customer` is never a stored account — it has no row in any auth/roles table. It is represented only as `customerName`/`customerPhone` fields on an `Appointment`.
- The seed script creates one baseline `Admin` document on first run in local/dev environments — the app should never require a manual DB insert to get an admin login working.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents, use a dedicated migration script.

## Bootstrap
- The seed script upserts reference data (the initial `Admin` account) — core business-entity collections (`Service`, `TimeSlot`, `Appointment`) start empty and are created only through the app itself.
- Required indexes:
  - `Service.uuid` (unique), `Service.isActive`
  - `TimeSlot.uuid` (unique), `TimeSlot.serviceId`, `TimeSlot.status`, `TimeSlot.startsAt`
  - `Appointment.uuid` (unique), `Appointment.timeSlotId`, `Appointment.status`
  - `Admin.uuid` (unique), `Admin.email` (unique)

## Soft Delete
- Documents are never permanently deleted.
- `Service` and `Admin` use `deactivatedAt`/`deletedAt` respectively — set to the current timestamp and (for `Admin`) filtered out of queries via `{ deletedAt: null }`. `Service` additionally exposes `isActive` (`false` once deactivated) since "deactivated" is a normal, user-facing state for a service, not a hidden one — the booking flow filters on `isActive: true`.
- `Appointment` is soft-deleted via its `status` field (`cancelled`) rather than a `deletedAt` timestamp — cancellation is itself a meaningful lifecycle state that must remain visible to the `Admin` dashboard, not hidden like a true delete.
- `TimeSlot` is excluded from soft-delete entirely — it is never removed or hidden once created; its full lifecycle (`available` / `held` / `booked`) is expressed through `status`, and a cancelled `Appointment` simply releases its `TimeSlot` back to `available` for reuse.
- Use Mongoose `pre('find')` middleware to exclude soft-deleted (`deletedAt`-based) documents automatically; `Service`/`Appointment` filtering is done by querying the appropriate `isActive`/`status` values explicitly at the call site instead, since those fields carry meaning beyond "hidden or not."

## Operational Notes
- Each service owns its own collections — never access another service's collections directly. `appointment-service` owns `Service`, `TimeSlot`, `Appointment`; `user-service` owns `Admin`. Cross-service data needs go through the gateway-proxied HTTP API, never a shared DB connection.
- Do not store in-memory state between requests — especially `TimeSlot.status`, which must always be read from the DB, never cached in a way that could serve a stale value during a hold/book check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- Exact `TimeSlot` granularity (30 vs. 60 minutes) — decided at clinic setup time, see `.doc/product-definition.md`'s Assumptions.
- `held` `TimeSlot` expiry timeout duration (exact seconds/minutes) — to be decided during `seat-concurrency-layer` implementation; no value is hardcoded in this file.
- Audit-log needs for admin actions (confirm/cancel) — not yet decided for v1.
