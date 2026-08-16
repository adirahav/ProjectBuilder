# Database Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{PROJECT_NAME}}, {{SERVICES_AND_PORTS}}, {{ENTITIES}}, {{MODEL_OWNERSHIP}}
  {{ROLE_NAME}}, {{ROLES_LIST}}, {{PERMISSION_KEYS}} — if RBAC is used
  {{CONTESTED_ENTITY}}, {{STATUS_VALUES}}, {{STATUS_TRANSITIONS}} — if a contested entity exists
  {{REQUIRED_INDEXES}}
Ask the user: "What are your core data entities and their key fields?" "Is there a stateful/contested entity requiring atomic concurrency-safe transitions?" "Do you need role-based permissions, or a simpler auth model?"
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

### <entity>  *(owned by <service>)*
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
- **Concurrency:** any transition away from the "available"/initial state must use an atomic, condition-checked update (e.g. Mongoose `findOneAndUpdate({ _id, status: '<expected>' }, { $set: { status: '<next>', ... } })`) so two simultaneous requests for the same resource can't both succeed. Never read-then-write the status in two separate steps. See `seat-concurrency-layer` skill for the full pattern.

## Roles & Permissions (RBAC — fill in if this project uses role-based access, otherwise delete this section)
- List the roles here: {{ROLES_LIST}}.
- An account's `roles` field is an array (not a single string) to support multiple roles per account later without a schema change.
- Permission `key`s follow `<category>:<action>` — e.g. {{PERMISSION_KEYS}}.
- List which routes remain fully public — the permission system governs admin-only write/management routes only.
- The seed script must create baseline role/permission documents on first run — the app should never start with zero roles defined.

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
