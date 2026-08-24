# Plan 002 — Scaffold tour-service backend project (package.json, Express, Mongoose, MONGODB_URI)

Status: done
Owner: orchestrator
Last updated: 2026-08-24
Scope-Agents: tour-service, qa

## Goal
Stand up the empty `backend/tour-service/` project skeleton — `package.json`, Express app, Mongoose connection wired to `MONGODB_URI`, `tsx` runner, base folder layering — so subsequent feature tickets (Tour/Bus/BusType/Seat CRUD, seat-concurrency flows) can build on a consistent, already-configured base matching `agents/backend/CLAUDE.md` and `.rule/database-rules.md`.

## Scope
- In scope: `backend/tour-service/package.json` (Node.js LTS, Express, Mongoose, `jsonwebtoken`, `bcrypt`, `tsx`, `vitest`, `cors`, `dotenv`); `tsconfig.json`; base folder layering per `backend-service-layer` skill (`api/lib/`, `api/tour/`, `api/bus/`, `api/busType/`, `api/seat/`); `api/lib/db.ts` (Mongoose connection using `MONGODB_URI`, no hardcoded credentials); `api/server.ts` wiring Express + CORS (restricted to `FRONTEND_ORIGIN`) + `GET /health` mounted first, before any other route/middleware, requiring no auth and touching no DB; `.env.example` (placeholders) and `.env` (local dev values, `PORT=4001`) for `tour-service` only; `dev`/`start`/`test` npm scripts; a minimal health-check test (`GET /health` → 200, no auth) to prove the harness works.
- Out of scope: `Tour`/`Bus`/`BusType`/`Seat` Mongoose models and any domain business logic (`tour.service.ts`, `bus.service.ts`, `busType.service.ts`, `seat.service.ts`, controllers, routes) — these belong to the feature tickets that implement the actual API contract (`docs/api-contract/api-contract.tour-service.yaml`), which does not exist yet; `user-management-service` (separate ticket, separate agent scope, forbidden path for this agent per `agents/backend/CLAUDE.md`); `backend/package.json` (shared root manifest — forbidden path, flag any needed change in the agent report instead); JWT verify/sign helper implementation beyond a scaffold stub, since no protected route exists yet; frontend wiring; seed script (`api/scripts/seed.ts`) — deferred until `BusType` model exists.

## Assumptions
- No `backend/` directory currently exists (confirmed empty, no prior backend scaffold plan).
- `docs/api-contract/api-contract.tour-service.yaml` does not exist yet — this ticket is pure scaffolding with no endpoints beyond `/health`, per `agents/backend/CLAUDE.md`'s instruction to implement only what the contract says; since there is no contract yet, no domain routes are implemented.
- `JWT_SECRET` must be identical across `tour-service` and `user-management-service`; since `user-management-service` isn't scaffolded in this ticket, a locally-generated placeholder value is used and flagged as needing to match once that service exists.
- Node.js (LTS) and npm are available in the environment.
- `tsx` is used for both dev and start scripts (no separate compile step), per `agents/backend/CLAUDE.md` Step 2 guidance.

## Open Questions
1. Should `MONGODB_URI` point at a real MongoDB instance (local or Atlas) during this scaffold ticket, or is a placeholder acceptable until the first model-bearing ticket lands?
- Recommended: placeholder value in `.env` (e.g. `mongodb://localhost:27017/hila-tours-tour-service`) is acceptable now — `api/lib/db.ts` connects but no queries exist yet in this ticket; ask the human for a real connection string only when the first domain model ticket needs to actually persist data.

2. Should this ticket generate a real `JWT_SECRET` now, or leave it blank/placeholder until `user-management-service` is scaffolded (since both services must share the exact same value)?
- Recommended: auto-generate a placeholder now and store it in `.env`/`.env.example`, but flag explicitly in the agent report that it must be copied verbatim into `user-management-service`'s env when that service is scaffolded — avoids two independently-generated secrets that silently don't match.

3. Should the health-check test be written with Vitest now, even though no domain logic exists yet to justify a full test setup?
- Recommended: yes — `agents/backend/CLAUDE.md` Step 6/7 requires `npm run test` to pass 100% before a service is marked done, and `.rule/testing-rules.md` treats test-harness setup as part of scaffolding, not deferred (unlike the frontend scaffold, which had zero backend logic to test at all).

## Steps
All steps operate in repo-relative folder: `backend/tour-service/`.

1. `backend/tour-service/`: `npm init -y` then edit `package.json` — name `tour-service`, add dependencies: `express`, `mongoose`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`; dev dependencies: `typescript`, `tsx`, `vitest`, `@types/express`, `@types/node`, `@types/cors`, `@types/jsonwebtoken`, `@types/bcrypt`, `supertest`, `@types/supertest`.
2. `backend/tour-service/tsconfig.json`: create with Node/ESM-compatible settings matching `tsx`'s expectations (verify moduleResolution against `tsx` requirements before assuming a specific config).
3. `backend/tour-service/api/lib/db.ts`: Mongoose connection helper reading `MONGODB_URI` from `process.env` (via `dotenv`), exported as a `connectDb()` function; throws a clear startup error if `MONGODB_URI` is unset — never a hardcoded connection string.
4. `backend/tour-service/api/lib/jwt.ts`: scaffold stub with `verifyToken()` helper reading `JWT_SECRET` from env (verify-only in this service per `agents/backend/CLAUDE.md`) — implementation body deferred to the first ticket that adds a protected route, but the file and env wiring exist now.
5. `backend/tour-service/api/server.ts`: Express app — CORS restricted to `FRONTEND_ORIGIN` env var, `GET /health` mounted first (`res.status(200).json({ status: 'ok' })`, no auth, no DB touch), `app.listen(PORT)` reading `PORT` from env.
6. Create empty-but-present domain folders establishing the layering convention from `agents/backend/CLAUDE.md`/`backend-service-layer` skill: `backend/tour-service/api/tour/`, `api/bus/`, `api/busType/`, `api/seat/` (no files yet — populated by future feature tickets).
7. `backend/tour-service/.env.example`: placeholders for `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN`, `PORT=4001`.
8. `backend/tour-service/.env`: local dev values (placeholder `MONGODB_URI`, generated `JWT_SECRET` per Open Question 2, `PORT=4001`, `FRONTEND_ORIGIN=http://localhost:5173` matching the Vite dev default) — never committed with real production credentials.
9. `backend/tour-service/package.json`: add `dev` (`tsx watch api/server.ts`), `start` (`tsx api/server.ts`), `test` (`vitest run`) scripts.
10. `backend/tour-service/api/server.test.ts` (or equivalent test file): Vitest + Supertest test asserting `GET /health` returns 200 with no auth header.
11. `backend/tour-service/`: run `npm run test` and confirm the health-check test passes.

## Validation
- `npm --prefix backend/tour-service run test` passes 100% (health-check test).
- `npm --prefix backend/tour-service run dev` boots without throwing (verified via a one-shot `GET /health` request during manual check, never left running per `agents/backend/CLAUDE.md`'s prohibition on long-running verification steps).
- Manually confirm `MONGODB_URI` is read from env only (no hardcoded connection string in `api/lib/db.ts`), and `.env` is not committed with real production secrets (placeholder acceptable per Open Question 1/2).
- Manually confirm `GET /health` is mounted before any other middleware/route and requires no auth.

## Risks
- `Seat` is the contested, concurrency-sensitive entity per `.rule/database-rules.md` and this scaffold ticket does not yet implement it — flagged so the next `tour-service` ticket that adds `seat.service.ts` treats atomic condition-checked updates as mandatory from the first line of code, not a later fix. `tour-service` is included in Scope-Agents specifically because this scaffold is the foundation that ticket depends on, not because this ticket itself touches seat logic.
- `security` is deliberately excluded from Scope-Agents for this ticket — no auth-protected route, no PII handling, and no seat-mutation endpoint exists yet (only `/health`); if a future revision of this plan adds any real domain route, Scope-Agents must be revisited to include `security`.
- Mismatched `JWT_SECRET` between `tour-service` and the not-yet-scaffolded `user-management-service` is a real risk if the placeholder generated here isn't copied verbatim later — mitigated by explicitly flagging it in the agent report (see Open Question 2).
- `tsx`/ESM moduleResolution misconfiguration is a known gotcha class per `agents/backend/CLAUDE.md` Step 2 — mitigated by verifying `tsconfig.json` against `tsx`'s actual requirements before assuming a specific config, and by the health-check test actually exercising the boot path.

## Rollout Order
1. `backend/tour-service/`: `package.json` + `tsconfig.json` + dependency install (step 1–2).
2. `backend/tour-service/`: `api/lib/db.ts` + `api/lib/jwt.ts` scaffolds + env files (steps 3–4, 7–8).
3. `backend/tour-service/`: `api/server.ts` with `/health` + domain folder layering (steps 5–6).
4. `backend/tour-service/`: scripts + health-check test + test run validation (steps 9–11).

## Rollback
Delete the `backend/tour-service/` directory entirely (it is newly created by this ticket, no existing code is modified) and remove any repo-root config changes made solely to support it (none expected — `backend/package.json` is a forbidden path this ticket does not touch).
