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

- `api-gateway` (port 4000) — single public entry point; verifies JWT; proxies to the three internal services below with `x-user-id`/`x-user-role` headers. Owns no Mongoose models.
- `appointment-service` (port 4001) — owns `Appointment`, `TimeSlot`. Domains: `appointment/`, `timeSlot/`.
- `catalog-service` (port 4002) — owns `Service`. Domains: `service/`.
- `user-management-service` (port 4003) — owns `Admin`. Domains: `auth/`. Admin login/auth only — no customer accounts.

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
**See the dedicated `mongoose-models-layer` skill for full schema definitions, the soft-delete hook pattern, required indexes, and query conventions.** Models: `Service` (`catalog-service`), `Appointment` and `TimeSlot` (`appointment-service`), `Admin` (`user-management-service`). Naming is camelCase throughout, per `.rule/naming-rules.md`; every model exposes `id` (a `uuid`) to clients and never `_id` — a controller receiving a client `id` param must resolve it to `_id` via the service layer before querying, and any `.lean()` result returned straight from a controller must be mapped through the same `uuid`→`id` shape by hand.

## Concurrency
`TimeSlot` is the contested resource. **See the dedicated `seat-concurrency-layer` skill before writing or reviewing any code that changes its status** — it covers the atomic-update pattern, the full per-action rule table, any multi-document case, and the concurrency test pattern in depth. The short version: every status-changing action is one atomic `findOneAndUpdate` with the precondition in the filter, never a separate read-then-write; booking an appointment (creating the `Appointment` and flipping the `TimeSlot`) needs a transaction or explicit rollback since it spans two documents; no endpoint ever accepts the status field directly from the client.

## JWT & Auth Middleware
**See the dedicated `jwt-middleware-layer` skill for the full trust model, token shape, and validation middleware — this project uses the gateway-centralized auth model.** Short version: only `user-management-service` issues tokens (via `api-gateway`'s login proxy); only `api-gateway` verifies the JWT; `appointment-service`, `catalog-service`, and `user-management-service` trust the `x-user-id`/`x-user-role` internal headers the gateway attaches and never verify a JWT themselves. All four services share the identical `JWT_SECRET` env value so the gateway can verify tokens issued by `user-management-service`; always pin `algorithms: ['HS256']` explicitly on both sign and verify.

## Error Handling & Status Codes
- `400` — validation failure (missing/malformed fields).
- `401` — missing/invalid/expired JWT on a protected route.
- `404` — resource not found (or soft-deleted, which reads as not-found to the API).
- Any special-case conflict status (e.g. `409` for a contested-resource conflict) — use it specifically and consistently; never collapse it into a generic `400`.
- `500` — unexpected server error only; never used for expected business-rule rejections.
- Never leak stack traces or raw Mongoose error objects in a response body — return a clean `{ error: string }` shape.

## Testing Expectations
Per `.rule/testing-rules.md`, any service touching `TimeSlot` (i.e. `appointment-service`) requires the deepest coverage in the repo:
- Every valid transition succeeds; every invalid transition is rejected with the right status.
- **Concurrency test is mandatory for `TimeSlot`:** fire two genuinely simultaneous calls for the same resource (e.g. `Promise.all([...])` against the running server, not sequential `await`s) and assert exactly one succeeds.
- Soft-delete: a deleted record is excluded from list/get results but its document still exists in the DB (assert both).
- Protected routes reject with `401` when the JWT is missing, expired, tampered, or uses `alg: none`.

## Implementation Checklist
- [ ] Routes contain no logic; controllers contain no business logic; services contain no request/response handling.
- [ ] Every status-changing action on a contested resource uses a single atomic `findOneAndUpdate` (or transaction, for multi-document actions) — never read-then-write.
- [ ] No endpoint accepts the status field directly from the client.
- [ ] All list/get queries filter `deletedAt: null` (via schema hook, not ad-hoc per query).
- [ ] `JWT_SECRET` is identical across every service's environment config.
- [ ] Any special-case conflict status is used specifically and only for that case; not reused for other validation failures.
- [ ] A genuine concurrent-request test exists for every contested-resource endpoint.
