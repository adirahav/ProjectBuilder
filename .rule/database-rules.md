# Database Rules

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: Dog Grooming Appointment Booking System — appointment booking for a single-groomer dog-grooming clinic.

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of reference data (e.g. the single Admin account, if not created via a setup route). It never touches core business-entity data.

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail: used for cross-collection refs and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism used to strip any sensitive field — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections

### Service *(owned by booking-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `durationMinutes` — Number, required
- `price` — Number, required
- `isActive` — Boolean, default: true (soft delete flag — deactivation, not deletion)
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null

### TimeSlot *(owned by booking-service — contested entity)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed)
- `serviceId` — ObjectId, ref: `Service`, required
- `startsAt` — Date, required
- `endsAt` — Date, required
- `status` — String, required, enum: `open`, `held`, `booked`, default: `open`
- `heldAt` — Date, default: null (when the current hold started, used to expire stale holds)
- `createdAt` — Date, default: Date.now
- Not soft-deleted — slots are generated/managed directly by status, not removed.

### Appointment *(owned by booking-service)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed)
- `serviceId` — ObjectId, ref: `Service`, required
- `timeSlotId` — ObjectId, ref: `TimeSlot`, required, unique
- `customerName` — String, required
- `customerPhone` — String, required
- `customerEmail` — String, default: null
- `status` — String, required, enum: `pending`, `confirmed`, `cancelled`, default: `pending`
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (an Appointment is cancelled via `status`, never hard-deleted; `deletedAt` exists only for the rare admin data-correction case)

### Admin *(owned by user-service)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed)
- `email` — String, required, unique
- `passwordHash` — String, required
- `createdAt` — Date, default: Date.now
- Single-row collection in practice (one Admin account in v1) — not soft-deleted.

## Status Rules

### TimeSlot.status
- Always one of `open`, `held`, `booked` — never any other string.
- Valid transitions (enforced in `booking-service`'s `timeSlot.service.ts`, not just at the DB layer):
  - `open` → `held` (customer starts booking)
  - `held` → `booked` (appointment created/confirmed)
  - `held` → `open` (hold expires or customer abandons the form)
  - `booked` → `open` (the linked `Appointment` is cancelled)
- **Concurrency:** any transition away from `open` must use an atomic, condition-checked update — `Model.findOneAndUpdate({ _id, status: 'open' }, { $set: { status: 'held', heldAt: new Date() } })` — so two simultaneous requests for the same slot can't both succeed. Never read-then-write the status in two separate steps. See `seat-concurrency-layer` skill for the full pattern.

### Appointment.status
- Always one of `pending`, `confirmed`, `cancelled` — never any other string.
- Valid transitions (enforced in `booking-service`'s `appointment.service.ts`):
  - `pending` → `confirmed` (Admin confirms)
  - `pending`/`confirmed` → `cancelled` (Admin or customer cancels; releases the linked `TimeSlot` back to `open`)

## Roles & Permissions
- Two roles only: `admin` (authenticated, full access to Service/Appointment management) and the implicit unauthenticated `customer` (public booking routes only). No permission-key system is needed at this scale — a single boolean "is this an authenticated Admin request" (verified once at `api-gateway`, forwarded as the `x-internal-admin` header) governs every write/management route.
- Public routes (no auth required): `GET /api/services`, `GET /api/time-slots`, `POST /api/time-slots/:id/hold`, `POST /api/appointments`.
- Admin-only routes (require the JWT, gateway-verified): all `Service` writes, all `Appointment` reads/writes beyond creation.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents, use a dedicated migration script.

## Bootstrap
- The seed script upserts the single Admin account (if one doesn't already exist) — core business-entity collections (`Service`, `TimeSlot`, `Appointment`) start empty and are created only through the app itself.
- Required indexes: `Service.uuid` (unique), `TimeSlot.uuid` (unique), `TimeSlot.serviceId` + `TimeSlot.status` (compound, for availability queries), `Appointment.uuid` (unique), `Appointment.timeSlotId` (unique), `Admin.uuid` (unique), `Admin.email` (unique).

## Soft Delete
- `Service` is soft-deleted via `isActive: false` (deactivation) rather than `deletedAt`, since "deactivate" is the product-facing concept (see `docs/PRD.md` F8).
- `Appointment` is effectively soft-deleted via its `status` field (`cancelled`); `deletedAt` exists only for rare manual data correction, not the normal cancel flow.
- `TimeSlot` is excluded from soft-delete — its `status` field alone governs visibility/availability; slots aren't created/removed by users.
- `Admin` is excluded from soft-delete — a single, permanent account in v1.
- All queries against soft-deleted-capable entities must filter accordingly (`{ isActive: true }` for `Service`, `{ deletedAt: null }` where `deletedAt` is used). Use Mongoose `pre('find')` middleware to exclude soft-deleted documents automatically where applicable.

## Operational Notes
- Each service owns its own collections — never access another service's collections directly. `booking-service` owns `Service`/`TimeSlot`/`Appointment`; `user-service` owns `Admin`; `notification-service` owns no persistent domain collections (may keep its own delivery-log collection).
- Do not store in-memory state between requests — especially `TimeSlot.status`, which must always be read from the DB, never cached in a way that could serve a stale value during a hold check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- Exact hold-expiry duration for `TimeSlot.held` (e.g. 5-10 minutes) — to be decided during `booking-service` implementation.
- Whether `notification-service` needs its own delivery-log collection, or can be stateless — decide once the email/SMS provider is chosen.
