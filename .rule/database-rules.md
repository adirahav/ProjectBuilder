# Database Rules

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: ClinicBook — appointment-booking system for a small clinic/salon, backed by MongoDB, one database per microservice.

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of reference data (e.g. the initial Admin account, if none exists). It never touches core business-entity data (`Service`, `Appointment`, `TimeSlot`).

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail: used for cross-collection refs and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism used to strip any sensitive field — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections

### Service  *(owned by catalog-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `durationMinutes` — Number, required
- `price` — Number, required
- `isActive` — Boolean, default: true (soft delete)
- `createdAt` — Date, default: Date.now

### Appointment  *(owned by appointment-service)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed)
- `serviceId` — String (uuid ref to Service), required
- `timeSlotId` — String (uuid ref to TimeSlot), required
- `customerName` — String, required
- `customerPhone` — String, required
- `customerEmail` — String, optional
- `notes` — String, optional
- `status` — String, required, enum: `pending`, `approved`, `cancelled`, `completed`, default: `pending`
- `createdAt` — Date, default: Date.now

### TimeSlot  *(owned by appointment-service — the contested entity)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed)
- `serviceId` — String (uuid ref to Service), required
- `startTime` — Date, required
- `endTime` — Date, required
- `status` — String, required, enum: `available`, `held`, `booked`, `blocked`, default: `available`
- `createdAt` — Date, default: Date.now

## Status Rules — TimeSlot (the contested entity)
- `status` must always be one of `available` | `held` | `booked` | `blocked` — never store any other string.
- Valid transitions (enforced in `appointment-service`'s `timeSlot.service.ts`, not just at the DB layer):
  - `available` → `held`/`pending` intent — when a customer submits `POST /api/appointments`, this happens atomically alongside creating the `pending` Appointment.
  - `held`/pending-linked → `booked` — when the admin approves the linked Appointment.
  - `held`/pending-linked or `booked` → `available` — when the linked Appointment is cancelled.
  - `available` → `blocked` — admin manually blocks the slot (e.g. lunch break).
  - `blocked` → `available` — admin unblocks the slot.
- **Concurrency:** any transition away from `available` must use an atomic, condition-checked update (e.g. Mongoose `findOneAndUpdate({ _id, status: 'available' }, { $set: { status: 'held', ... } })`) so two simultaneous booking requests for the same TimeSlot can't both succeed. Never read-then-write the status in two separate steps. See `seat-concurrency-layer` skill (adapted to TimeSlot/Appointment) for the full pattern.

## Roles & Permissions
- Single authenticated role: `admin`. No RBAC tiers, no permission-key system — every authenticated request is treated as full-admin.
- `user-management-service` owns one collection, `Admin` (email, hashed password, `uuid`), used solely for login — no customer accounts exist anywhere.
- All customer-facing routes (`GET /api/services`, `GET /api/time-slots`, `POST /api/appointments`) are fully public — no token required.
- All Admin dashboard routes (service management, appointment approve/cancel, time-slot management) require a valid JWT verified at `api-gateway`.
- The seed script must create the initial `Admin` document on first run if none exists — the app should never start with zero admin accounts and no way to log in.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents, use a dedicated migration script.

## Bootstrap
- The seed script upserts reference data (the initial `Admin` account) — core business-entity collections (`Service`, `Appointment`, `TimeSlot`) start empty and are created only through the app itself.
- Required indexes: `uuid` (unique) on every collection; `Service.isActive`; `TimeSlot.serviceId` + `TimeSlot.startTime` (compound, for availability queries); `TimeSlot.status`; `Appointment.status`; `Appointment.timeSlotId`; `Admin.email` (unique).

## Soft Delete
- `Service` is soft-deleted via `isActive: false` — never permanently deleted, since past Appointments still reference it.
- `Appointment` and `TimeSlot` are never soft- or hard-deleted — their `status` field is the lifecycle record; history is preserved by design (`cancelled`/`completed` remain queryable).
- Queries listing active Services must filter `{ isActive: true }` on customer-facing routes; the Admin dashboard may show inactive Services too.

## Operational Notes
- Each service owns its own collections — never access another service's collections directly. `appointment-service` never queries `catalog-service`'s `Service` collection directly; it stores `serviceId` (uuid) and, if it needs Service details, calls `catalog-service`'s API.
- Do not store in-memory state between requests — especially `TimeSlot.status`, which must always be read from the DB, never cached in a way that could serve a stale value during a booking check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- Whether TimeSlot generation is fully manual (admin creates each slot one at a time) or template-driven (admin sets recurring daily availability and slots auto-generate) — to be decided during backend implementation; either way the schema above holds.
- Whether an audit log is needed for Admin actions on Appointments (approve/cancel history) — not required for v1.
