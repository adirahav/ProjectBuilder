# Database Rules

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: Hila Tours — a real-time tour-bus seat-booking management system for passengers and admins.

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of reference data (e.g. a default `busType`, if used). It never touches core business-entity data.

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail — used for cross-collection refs and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism used to strip any sensitive field (e.g. `passwordHash`) — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections

### tour  *(owned by tour-service)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `date` — Date, required
- `description` — String
- `createdBy` — String (admin `uuid`)
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

### bus  *(owned by tour-service)*
- `_id` — ObjectId
- `uuid` — String (unique, indexed)
- `tourId` — String (`tour` uuid, indexed) — belongs to a `tour`
- `name` — String, required
- `seatLayout` — Object/Array (rows, door position, driver side, seat grid)
- `pickupPoints` — Array of `{ name: String, order: Number }`
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

### busType  *(owned by tour-service)*
- `_id` — ObjectId
- `uuid` — String (unique, indexed)
- `rows` — Number, required
- `doorRowPosition` — Number, required
- `backRowSeatCount` — Number, required
- `manuallyBlockedSeats` — Array of seat positions
- `isDefault` — Boolean, default: false (exactly one `busType` may have `isDefault: true` — enforced in `busType.service.ts`)
- `createdAt` — Date, default: Date.now
- Not soft-deleted — see Soft Delete section below.

### seat  *(owned by tour-service — the contested entity)*
- `_id` — ObjectId
- `uuid` — String (unique, indexed)
- `busId` — String (`bus` uuid, indexed) — belongs to a `bus`
- `position` — Object (row/column or seat number in the bus layout)
- `status` — String, required, enum: `available` | `pending` | `taken` | `reserved`, default: `available`
- `pickupPointName` — String, null until requested
- `passengerName` — String, null until requested
- `passengerPhone` — String, null until requested
- `requestedAt` — Date, null
- `approvedAt` — Date, null
- `assignedBy` — String (admin `uuid`, set on `manual-assign`), null
- Not soft-deleted — see Soft Delete section below.

### admin  *(owned by user-management-service)*
- `_id` — ObjectId
- `uuid` — String (unique, indexed)
- `username` — String, required, unique
- `email` — String, required, unique
- `passwordHash` — String, required (never serialized to a client — strip in `toJSON`)
- `roles` — Array of String, enum values `admin` | `user`, default: `["user"]`
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete — for account deactivation)

## Status Rules — seat (the contested entity)
- `status` must always be one of `available` / `pending` / `taken` / `reserved` — never store any other string.
- Valid transitions (enforced in `tour-service`'s `seat.service.ts`, not just at the DB layer):
  - `available` → `pending` (passenger `request`)
  - `pending` → `taken` (admin `approve`)
  - `pending` → `available` (admin `cancel`)
  - `taken` → `available` (admin `cancel`)
  - `available` → `reserved`, `reserved` → `available` (admin `toggle-reserve`)
  - any state → `taken` (admin `manual-assign`, passenger set directly)
  - any two seats → positions/occupants exchanged or moved (admin `swap-move`, single atomic operation)
- **Concurrency:** any transition away from `available` must use an atomic, condition-checked update (e.g. Mongoose `findOneAndUpdate({ _id, status: 'available' }, { $set: { status: 'pending', ... } })`) so two simultaneous requests for the same seat can't both succeed. A losing request receives a conflict response (409) and the frontend refreshes the seat map — never a silent overwrite. Never read-then-write the status in two separate steps. See `seat-concurrency-layer` skill for the full pattern.

## Roles & Permissions (RBAC)
- Roles: `admin`, `user`.
- An `admin` entity's `roles` field is an array (not a single string) to support multiple roles per account later without a schema change. Every new signup gets `roles: ["user"]`; only an existing admin can promote another account via `PATCH /api/admins/:id/roles`.
- Permission checks are role-gate checks, not a fine-grained permission-key system: every mutating admin route on `tour-service` and every admin-management route on `user-management-service` requires `roles.includes("admin")`.
- Fully public routes (no auth required): `GET /api/tours`, `GET /api/buses/:busId/seats`, `POST /api/seats/bookings` (passenger request), `POST /api/auth/login`, `POST /api/auth/signup`. All other routes require a valid admin JWT with the `admin` role.
- The `tour-service` seed script may upsert a default `busType` on first run; `user-management-service` does not need a seed script unless a bootstrap admin account is desired for local dev.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents, use a dedicated migration script.

## Bootstrap
- The seed script upserts reference data only (e.g. a default `busType`) — core business-entity collections (`tour`, `bus`, `seat`, `admin`) start empty and are created only through the app itself.
- Required indexes:
  - `tour.uuid` (unique), `bus.uuid` (unique), `bus.tourId`, `busType.uuid` (unique), `seat.uuid` (unique), `seat.busId`, `seat.status`, `admin.uuid` (unique), `admin.username` (unique), `admin.email` (unique).

## Soft Delete
- Documents are never permanently deleted — set `deletedAt` to current timestamp, for every entity marked as soft-deleted above.
- Soft-deleted entities: `tour`, `bus`, `admin`.
- All queries against soft-deleted entities must filter: `{ deletedAt: null }`.
- Use Mongoose `pre('find')` middleware to exclude soft-deleted documents automatically.
- **Not soft-deleted: `busType` and `seat`.** `busType` is small admin-managed reference data (hard delete is fine and matches its `delete` action in the PRD). `seat` documents are created once per bus layout and never deleted independently — they're recreated when a bus's layout changes, and cease to be relevant only when their parent `bus` is soft-deleted.

## Operational Notes
- Each service owns its own collections — never access another service's collections directly (`tour-service` owns `tour`/`bus`/`busType`/`seat`; `user-management-service` owns `admin`).
- Do not store in-memory state between requests — especially `seat.status`, which must always be read from the DB, never cached in a way that could serve a stale value during a status check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- Per-tour admin ownership vs. shared admin pool — deferred per `product-definition.md`/`architecture.md` Open Questions.
- Whether `user-management-service` needs a seed script for a bootstrap admin account in local dev.
