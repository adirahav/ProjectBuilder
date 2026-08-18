---
name: backend-service-layer
description: Use this skill when implementing Express routes, Mongoose models, or business logic in the backend service(s). Covers the controller/service/routes/middleware pattern, soft-delete, JWT auth, and — if applicable — any atomic concurrency guard for a contested resource.
references:
  - @.rule/database-rules.md
  - @.rule/coding-rules.md
  - @.rule/glossary.md
  - @.rule/naming-rules.md
  - @.rule/testing-rules.md
  - @seat-concurrency-layer/SKILL.md
  - @mongoose-models-layer/SKILL.md
  - @jwt-middleware-layer/SKILL.md
---

# Backend Service Layer Guidelines
*Goal:* Implement each service's business logic, data access, and API surface exactly to its contract, with clean separation between routing, request/response handling, and domain logic — and with any contested-resource concurrency guarantee treated as non-negotiable.

**Core Responsibilities:**
- *Routing:* Wiring `<method> + path → controller`, nothing else.
- *Controllers:* Request/response shape only — parse input, call the service, return the right status code. No business logic here.
- *Services:* All business logic, validation, and DB access.
- *Middleware:* Auth (JWT) and any domain-specific request guards.

## Which Service Am I In?
Each invocation targets exactly one service (see `agents/backend/CLAUDE.md`) — never write to another service's directory.

- **`gateway`** (port 5000) — reverse proxy for all client traffic; verifies the JWT once and attaches trusted `x-user-id`/`x-user-role` headers; routes to `appointment-service` and `user-service`. Owns no models.
- **`appointment-service`** (port 5001) — owns `Service`, `TimeSlot`, `Appointment` models, routes, and the concurrency-safe `TimeSlot` claim logic.
- **`user-service`** (port 5002) — owns the `Admin` model, login, and JWT issuance. Does not store `Customer` as an account.

## File Structure Per Domain
`api/` is the top-level folder directly under each service:
```
backend/<service>/
  api/
    lib/
      db.ts              # Mongoose connection
      jwt.ts              # sign/verify helpers (issuing service only)
    models/
      <model>.model.ts    # Mongoose schema
    <domain>/
      <domain>.routes.ts       # route wiring only
      <domain>.controller.ts   # request/response only
      <domain>.service.ts      # business logic + DB access
      <domain>.middleware.ts   # domain-specific guards (if any)
    app.ts                  # createApp() — Express app, no listen()
    server.ts                # listen() only, imports createApp()
  __tests__/                   # or per-domain test files — see .rule/testing-rules.md
```
Controllers never touch Mongoose directly — they call the service. Routes never contain logic — they call the controller. This mirrors `.rule/coding-rules.md`'s backend architecture section.

**Report/test write paths are always repo-root-relative, never relative to your current shell directory.** If a step has you `cd backend/<service>` to run `npm` commands, every subsequent file write (reports, `docs/tests/security/...`, etc.) must still resolve against the repository root. A stray `backend/docs/`, `backend/<service>/docs/`, or similar path appearing anywhere under `backend/` is exactly this bug — reports and tests never belong there.

## Mongoose Models
**See the dedicated `mongoose-models-layer` skill for full schema definitions, the soft-delete hook pattern, required indexes, and query conventions.** Models: `Service`, `TimeSlot`, `Appointment` (all in `appointment-service`), `Admin` (in `user-service`). Naming is camelCase throughout, per `.rule/naming-rules.md`; every model exposes `id` (a `uuid`) to clients and never `_id` — a controller receiving a client `id` param must resolve it to `_id` via the service layer before querying, and any `.lean()` result returned straight from a controller must be mapped through the same `uuid`→`id` shape by hand.

## Concurrency
`TimeSlot` is the contested entity in this system. **See the dedicated `seat-concurrency-layer` skill before writing or reviewing any code that changes its status** — it covers the atomic-update pattern, the full per-action rule table, and the concurrency test pattern in depth. The short version: every status-changing action (`hold`, `book`, `cancel`) is one atomic `findOneAndUpdate` with the precondition in the filter, never a separate read-then-write; no endpoint ever accepts the `status` field directly from the client.

## JWT & Auth Middleware
**See the dedicated `jwt-middleware-layer` skill for the full trust model, token shape, and gateway-centralized auth model.** Short version: only `user-service` signs tokens, at admin login. Only `gateway` verifies the JWT — it verifies once, then attaches trusted `x-user-id`/`x-user-role` headers before proxying. `appointment-service` and `user-service` never see the raw JWT and never call `jwt.verify` themselves — they trust the gateway's headers. `JWT_SECRET` only needs to be known by `gateway` and `user-service` (the issuer); `appointment-service` never validates a token at all.

## Error Handling & Status Codes
- `400` — validation failure (missing/malformed fields).
- `401` — missing/invalid/expired JWT on a protected route.
- `404` — resource not found (or soft-deleted, which reads as not-found to the API).
- `409` — a `TimeSlot` hold/book conflict (the slot's status precondition no longer matched) — use it specifically and consistently; never collapse it into a generic `400`.
- `500` — unexpected server error only; never used for expected business-rule rejections.
- Never leak stack traces or raw Mongoose error objects in a response body — return a clean `{ error: string }` shape.

## Testing Expectations
Per `.rule/testing-rules.md`, any service touching `TimeSlot` requires the deepest coverage in the repo:
- Every valid transition succeeds; every invalid transition is rejected with the right status.
- **Concurrency test is mandatory:** fire two genuinely simultaneous calls against the same `TimeSlot` (e.g. `Promise.all([...])` against the running server, not sequential `await`s) and assert exactly one succeeds.
- Soft-delete: a deleted record is excluded from list/get results but its document still exists in the DB (assert both).
- Protected routes reject with `401` when the JWT is missing, expired, tampered, or uses `alg: none`.

## Implementation Checklist
- [ ] Routes contain no logic; controllers contain no business logic; services contain no request/response handling.
- [ ] Every status-changing action on `TimeSlot` uses a single atomic `findOneAndUpdate` — never read-then-write.
- [ ] No endpoint accepts the `status` field directly from the client.
- [ ] All list/get queries filter soft-deleted/inactive records appropriately (`Service.isActive`, via schema hook, not ad-hoc per query).
- [ ] `JWT_SECRET` is identical across `gateway` and `user-service`'s environment config.
- [ ] `409` is used specifically and only for `TimeSlot` conflicts; not reused for other validation failures.
- [ ] A genuine concurrent-request test exists for the `hold`/`book` `TimeSlot` endpoints.
