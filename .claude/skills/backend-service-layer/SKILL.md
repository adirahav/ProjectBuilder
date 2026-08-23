---
name: backend-service-layer
description: Use this skill when implementing Express routes, Mongoose models, or business logic in the backend service(s). Covers the controller/service/routes/middleware pattern, soft-delete, JWT auth, and any atomic concurrency guard for a contested resource.
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
*Goal:* Implement each service's business logic, data access, and API surface exactly to its contract, with clean separation between routing, request/response handling, and domain logic — and with the seat concurrency guarantee treated as non-negotiable.

**Core Responsibilities:**
- *Routing:* Wiring `<method> + path → controller`, nothing else.
- *Controllers:* Request/response shape only — parse input, call the service, return the right status code. No business logic here.
- *Services:* All business logic, validation, and DB access.
- *Middleware:* Auth (JWT) and any domain-specific request guards.

## Which Service Am I In?
Each invocation targets exactly one service (see `agents/backend/CLAUDE.md`) — never write to another service's directory. There is no gateway — each service is reached by the frontend directly via its own base URL.

- **`tour-service`** (`TOUR_SERVICE_BASE_URL`) — owns `Tour`, `Bus`, `Seat`, `BusType`. All domain/business logic including the seat concurrency-sensitive flows.
- **`user-management-service`** (`USER_SERVICE_BASE_URL`) — owns `Admin`, login, signup, JWT issuance.

## File Structure Per Domain
`api/` is the top-level folder directly under each service:
```
backend/<service>/
  api/
    lib/
      config.ts            # env var loading + typed config object — see the dotenv note below
      db.ts              # Mongoose connection
      jwt.ts              # sign/verify helpers (issuing service only — user-management-service)
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

**`config.ts` must load the real per-environment secrets file, not whatever the bare dotenv import defaults to.** A plain, un-configured dotenv import only ever loads a file literally named `.env` with no suffix — this project's convention names the real files per-environment instead (check `backend/*/` for the exact example filenames this repo actually uses), so the bare import silently loads nothing and every var falls back to its hardcoded default (localhost DB, empty secrets) with no error at all. Always pass an explicit `path` naming the actual per-environment file for the current `NODE_ENV`, resolved once at the top of `config.ts` before any `process.env.*` read below it — every other file that needs config should import the resolved `config` object from here, not load the file again itself.

## Mongoose Models
**See the dedicated `mongoose-models-layer` skill for full schema definitions, the soft-delete hook pattern, required indexes, and query conventions.** Models: `Tour`, `Bus`, `BusType`, `Seat` (`tour-service`), `Admin` (`user-management-service`). Naming is camelCase throughout, per `.rule/naming-rules.md`; every model exposes `id` (a `uuid`) to clients and never `_id` — a controller receiving a client `id` param must resolve it to `_id` via the service layer before querying, and any `.lean()` result returned straight from a controller must be mapped through the same `uuid`→`id` shape by hand.

## Concurrency
`Seat` is the contested resource — this is high-risk logic. **See the dedicated `seat-concurrency-layer` skill before writing or reviewing any code that changes `seatStatus`** — it covers the atomic-update pattern, the full per-action rule table (request/approve/cancel/toggle-reserve/manual-assign/swap-move), the `swap-move` multi-document case, and the concurrency test pattern in depth. The short version: every status-changing action is one atomic `findOneAndUpdate` with the precondition in the filter, never a separate read-then-write; `swap-move` needs a transaction or explicit rollback since it touches two seat documents; no endpoint ever accepts `status` directly from the client.

## JWT & Auth Middleware
**See the dedicated `jwt-middleware-layer` skill for the full trust model, token shape, and validation middleware — there is no gateway, so this project uses the per-service model: every service verifies the JWT independently.** Short version: only `user-management-service` signs tokens; both `user-management-service` and `tour-service` validate independently with the identical `JWT_SECRET`; always pin `algorithms: ['HS256']` explicitly on both sign and verify.

## Error Handling & Status Codes
- `400` — validation failure (missing/malformed fields).
- `401` — missing/invalid/expired JWT on a protected route.
- `404` — resource not found (or soft-deleted, which reads as not-found to the API).
- `409` — seat conflict: the seat's precondition no longer holds (someone else claimed/changed it first) on any of the six seat-mutation routes. Use it specifically and consistently; never collapse it into a generic `400`.
- `500` — unexpected server error only; never used for expected business-rule rejections.
- Never leak stack traces or raw Mongoose error objects in a response body — return a clean `{ error: string }` shape.

## Testing Expectations
Per `.rule/testing-rules.md`, `tour-service`'s seat endpoints require the deepest coverage in the repo:
- Every valid `seatStatus` transition succeeds; every invalid transition is rejected with the right status.
- **Concurrency test is mandatory** for `seats/bookings`, `seats/approve`, `seats/cancel`, `seats/toggle-reserve`, `seats/manual-assign`, `seats/swap-move`: fire two genuinely simultaneous calls for the same seat (e.g. `Promise.all([...])` against the running server, not sequential `await`s) and assert exactly one succeeds with `409` for the loser.
- Soft-delete (`tour`, `bus` only): a deleted record is excluded from list/get results but its document still exists in the DB (assert both).
- Protected routes reject with `401` when the JWT is missing, expired, tampered, or uses `alg: none`; admin-mutating routes additionally reject a `roles: ["user"]`-only token with `403`/`401` per the route's authorization check.

## Implementation Checklist
- [ ] Routes contain no logic; controllers contain no business logic; services contain no request/response handling.
- [ ] Every seat status-changing action uses a single atomic `findOneAndUpdate` (or transaction, for `swap-move`) — never read-then-write.
- [ ] No endpoint accepts `status` directly from the client.
- [ ] All list/get queries on `tour`/`bus` filter `deletedAt: null` (via schema hook, not ad-hoc per query).
- [ ] `JWT_SECRET` is identical across `tour-service` and `user-management-service`'s environment config.
- [ ] `409` is used specifically and only for seat conflicts; not reused for other validation failures.
- [ ] A genuine concurrent-request test exists for every seat-mutation endpoint.
