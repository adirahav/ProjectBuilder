# Database Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{PROJECT_NAME}}, {{SERVICES_AND_PORTS}}, {{ENTITIES}}, {{MODEL_OWNERSHIP}}
  {{ROLE_NAME}}, {{ROLES_LIST}}, {{PERMISSION_KEYS}} — every project has these; a fixed two-role app still fills them in, just with a short list
  {{CONTESTED_ENTITY}}, {{STATUS_VALUES}}, {{STATUS_TRANSITIONS}} — if a contested entity exists
  {{REQUIRED_INDEXES}}
Ask the user: "What are your core data entities and their key fields?" "Is there a stateful/contested entity requiring atomic concurrency-safe transitions?" "What roles does this product have, and what does each one grant?" — never "do you need role-based permissions" framed as opt-in; every project gets the `roles`/`permissions` collection shape below regardless of how few roles it has.
Delete this comment block once filled.
-->

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: {{PROJECT_NAME}} — one-line description of the domain.

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of reference data (e.g. roles/permissions, if used). It never touches core business-entity data.

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail: used for cross-collection refs and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism used to strip any sensitive field — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections
List every collection here, one subsection per entity in {{ENTITIES}}, following this shape:

### <entity>  *(owned by <service>)* — collection name is the entity name lowercased and singular (`User` -> `user`, never `users`); pass it as the explicit third argument to `model(...)` (see `mongoose-models-layer` skill) since Mongoose otherwise auto-pluralizes
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- ...domain fields...
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete — omit if this entity isn't soft-deleted)

If a contested entity exists, describe its status field here:
### {{CONTESTED_ENTITY}}
- `status` — String, required, enum: {{STATUS_VALUES}}, default: `<initial value>`
- Other fields tracking who/what triggered the current state (e.g. requester info, timestamps, who last modified it).

## Status Rules (fill in if {{CONTESTED_ENTITY}} exists)
- `status` must always be one of the canonical values above — never store any other string.
- Valid transitions (enforced in the owning service's `<entity>.service.ts`, not just at the DB layer): {{STATUS_TRANSITIONS}}
- **Concurrency:** any transition away from the "available"/initial state must use an atomic, condition-checked update (e.g. Mongoose `findOneAndUpdate({ _id, status: '<expected>' }, { $set: { status: '<next>', ... } })`) so two simultaneous requests for the same resource can't both succeed. Never read-then-write the status in two separate steps. See `resource-concurrency-layer` skill for the full pattern.

## Roles & Permissions (RBAC — always present, even for a fixed, small role set)
Every project has this, unconditionally — never a single `role: String` enum field and never deleted as "not needed here." A project with exactly two fixed roles and one with a full admin permission matrix use the exact same shape below; the only thing that varies per project is how many roles/permissions actually get seeded, never whether these collections exist at all. Confirmed live: a project skipped this (plain `role: String`, no `roles`/`permissions` collections) because its role set looked simple and fixed at setup time — and simple, fixed role sets are exactly the ones most likely to stop being fixed later (a second role added to an account, an admin-only feature added after launch), which is a real schema migration under the single-string design and a pure data change (seed a new role/permission document) under this one.
- List the roles here: {{ROLES_LIST}} (as few as two is fine — this section's shape doesn't scale with how many there are).
- An account's `roles` field is an **array** of role keys, never a single string — even a project where every account genuinely has exactly one role today still uses `roles: [String]` with one entry, so adding a second role to an account later is a data change, not a schema/migration change.
- `role` and `permission` are real collections (singular names, per this file's own naming convention above — not a hardcoded enum/constant), each document with its own `uuid` per the External Identity rule above:
  - `role`: `key` (String, unique, e.g. `"owner"`), `name` (display label), `permissionKeys` (array of permission keys this role grants).
  - `permission`: `key` (String, unique, `<category>:<action>` shape — e.g. {{PERMISSION_KEYS}}), `description`.
- The seed script must create baseline role/permission documents on first run — the app should never start with zero roles defined, regardless of how few roles the product has.
- List which routes remain fully public — the permission system governs everything else, not just admin-only routes; a project with only two roles still checks membership in `roles`/looks up `permissionKeys`, it just has a short list to check against.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents, use a dedicated migration script.

## Bootstrap
- The seed script upserts reference data — core business-entity collections start empty and are created only through the app itself.
- Required indexes: {{REQUIRED_INDEXES}}

## Soft Delete
- Documents are never permanently deleted — set `deletedAt` to current timestamp, for every entity marked as soft-deleted above.
- All queries must filter: `{ deletedAt: null }`.
- Use Mongoose `pre('find')` middleware to exclude soft-deleted documents automatically.
- Any entity excluded from soft-delete should say so explicitly here, along with why (e.g. deleted/recreated with its parent, or small admin-managed reference data).

## Operational Notes
- Each service owns its own collections — never access another service's collections directly ({{MODEL_OWNERSHIP}}).
- Do not store in-memory state between requests — especially any contested-entity status, which must always be read from the DB, never cached in a way that could serve a stale value during a status check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- List anything still undecided about the schema, indexing, or audit-log needs here.
