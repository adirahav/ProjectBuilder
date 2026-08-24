# Plan 003 — Scaffold user-management-service backend project (package.json, Express, Mongoose, MONGODB_URI, JWT)

Status: done
Owner: orchestrator
Last updated: 2026-08-24
Scope-Agents: user-management-service, security, qa

## Goal
Stand up the empty `backend/user-management-service/` project skeleton — `package.json`, Express app, Mongoose connection wired to `MONGODB_URI`, `tsx` runner, base folder layering — so subsequent feature tickets (F1 login, F2 signup, F2b role promotion) can build on a consistent, already-configured base matching `agents/backend/CLAUDE.md`, `.rule/database-rules.md`, and `jwt-middleware-layer` skill.

## Scope
- In scope: `backend/user-management-service/package.json` (Node.js LTS, Express, Mongoose, `jsonwebtoken`, `bcrypt`, `tsx`, `vitest`, `cors`, `dotenv`); `tsconfig.json`; base folder layering per `backend-service-layer` skill (`api/lib/`, `api/auth/`, `api/admin/`, `api/user/`); `api/lib/db.ts` (Mongoose connection using `MONGODB_URI`, no hardcoded credentials); `api/lib/jwt.ts` (this service both **signs** and verifies tokens, unlike `tour-service` which only verifies — per `jwt-middleware-layer` skill); `api/server.ts` wiring Express + CORS (restricted to `FRONTEND_ORIGIN`) + `GET /health` mounted first, before any other route/middleware, requiring no auth and touching no DB; `.env.example` (placeholders) and `.env` (local dev values, `PORT=4002`) for `user-management-service` only; `dev`/`start`/`test` npm scripts; a minimal health-check test (`GET /health` → 200, no auth) to prove the harness works.
- Out of scope: `User`/`Admin` Mongoose models, password hashing wiring, and any domain business logic (`auth.service.ts`, `admin.service.ts`, controllers, routes) implementing `POST /api/auth/login`, `POST /api/auth/signup`, `PATCH /api/admins/:id/roles` — these belong to the feature tickets that implement the actual API contract (`docs/api-contract/api-contract.user-management-service.yaml`), which does not exist yet; `tour-service` (separate ticket, already scaffolded per Plan 002, forbidden path for this agent per `agents/backend/CLAUDE.md`); `backend/package.json` (shared root manifest — forbidden path, flag any needed change in the agent report instead); frontend wiring; seed script for an initial admin account (deferred until the `Admin`/`User` model and signup/role-promotion logic exist).

## Assumptions
- `backend/tour-service/` already exists (Plan 002, `Status: done`) and establishes the sibling-service pattern this plan mirrors.
- `docs/api-contract/api-contract.user-management-service.yaml` does not exist yet — this ticket is pure scaffolding with no endpoints beyond `/health`, per `agents/backend/CLAUDE.md`'s instruction to implement only what the contract says.
- `JWT_SECRET` must be identical across `tour-service` and `user-management-service` (shared token verification). Plan 002 generated a placeholder value in `backend/tour-service/.env` and flagged it must be copied verbatim here.
- Node.js (LTS) and npm are available in the environment.
- `tsx` is used for both dev and start scripts (no separate compile step), per `agents/backend/CLAUDE.md` Step 2 guidance.
- Per PRD F2b, signup must always create accounts with `roles: ["user"]`; only an existing admin can promote to `admin`. No admin account exists yet at scaffold time, so a bootstrap path for the first admin is deferred to the feature ticket (flagged in Risks), not solved here.

## Open Questions
1. Should `JWT_SECRET` be copied verbatim from `backend/tour-service/.env` into this service's `.env`, or independently generated?
- Recommended: copy verbatim from `backend/tour-service/.env` — both services must validate the same tokens, and independently generating a second secret would silently break cross-service auth the first time `tour-service` verifies a token issued here.
2. Should `MONGODB_URI` point at a real MongoDB instance, or is a placeholder acceptable until the first model-bearing ticket lands?
- Recommended: placeholder value in `.env` (e.g. `mongodb://localhost:27017/hila-tours-user-management-service`), consistent with the approach taken in Plan 002 — `api/lib/db.ts` connects but no queries exist yet in this ticket.
3. Should this service use a separate MongoDB database/connection string from `tour-service`, or share one database?
- Recommended: separate database (`hila-tours-user-management-service` vs `hila-tours-tour-service`) — keeps service data ownership boundaries clean per `.rule/database-rules.md` and avoids one service's schema changes accidentally affecting the other's collections.
4. Should the health-check test be written with Vitest now, even though no domain logic exists yet to justify a full test setup?
- Recommended: yes, mirroring Plan 002 — `agents/backend/CLAUDE.md` Step 6/7 requires `npm run test` to pass 100% before a service is marked done, and `.rule/testing-rules.md` treats test-harness setup as part of scaffolding.

## Steps
All steps operate in repo-relative folder: `backend/user-management-service/`.

1. `backend/user-management-service/`: `npm init -y` then edit `package.json` — name `user-management-service`, add dependencies: `express`, `mongoose`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`; dev dependencies: `typescript`, `tsx`, `vitest`, `@types/express`, `@types/node`, `@types/cors`, `@types/jsonwebtoken`, `@types/bcrypt`, `supertest`, `@types/supertest`.
2. `backend/user-management-service/tsconfig.json`: create with Node/ESM-compatible settings matching `tsx`'s expectations (verify moduleResolution against `tsx`'s actual requirements, mirroring the config validated in Plan 002).
3. `backend/user-management-service/api/lib/db.ts`: Mongoose connection helper reading `MONGODB_URI` from `process.env` (via `dotenv`), exported as a `connectDb()` function; throws a clear startup error if `MONGODB_URI` is unset — never a hardcoded connection string.
4. `backend/user-management-service/api/lib/jwt.ts`: scaffold stub with both `signToken()` and `verifyToken()` helpers reading `JWT_SECRET`/`JWT_EXPIRES_IN` from env — this service is the token issuer, unlike `tour-service`'s verify-only stub — implementation bodies deferred to the first ticket that adds `POST /api/auth/login`, but the file and env wiring exist now.
5. `backend/user-management-service/api/server.ts`: Express app — CORS restricted to `FRONTEND_ORIGIN` env var, `GET /health` mounted first (`res.status(200).json({ status: 'ok' })`, no auth, no DB touch), `app.listen(PORT)` reading `PORT` from env.
6. Create empty-but-present domain folders establishing the layering convention from `agents/backend/CLAUDE.md`/`backend-service-layer` skill: `backend/user-management-service/api/auth/`, `api/admin/`, `api/user/` (no files yet — populated by future feature tickets implementing F1/F2/F2b).
7. `backend/user-management-service/.env.example`: placeholders for `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN`, `PORT=4002`.
8. `backend/user-management-service/.env`: local dev values (placeholder `MONGODB_URI` per Open Question 2/3, `JWT_SECRET` copied verbatim from `backend/tour-service/.env` per Open Question 1, `PORT=4002`, `FRONTEND_ORIGIN=http://localhost:5173` matching the Vite dev default) — never committed with real production credentials.
9. `backend/user-management-service/package.json`: add `dev` (`tsx watch api/server.ts`), `start` (`tsx api/server.ts`), `test` (`vitest run`) scripts.
10. `backend/user-management-service/api/server.test.ts` (or equivalent test file): Vitest + Supertest test asserting `GET /health` returns 200 with no auth header.
11. `backend/user-management-service/`: run `npm run test` and confirm the health-check test passes.

## Validation
- `npm --prefix backend/user-management-service run test` passes 100% (health-check test).
- `npm --prefix backend/user-management-service run dev` boots without throwing (verified via a one-shot `GET /health` request during manual check, never left running per `agents/backend/CLAUDE.md`'s prohibition on long-running verification steps).
- Manually confirm `MONGODB_URI` is read from env only (no hardcoded connection string in `api/lib/db.ts`), and `.env` is not committed with real production secrets (placeholder acceptable per Open Question 2/3).
- Manually confirm `GET /health` is mounted before any other middleware/route and requires no auth.
- Manually confirm `JWT_SECRET` in `backend/user-management-service/.env` matches `backend/tour-service/.env` byte-for-byte (per Open Question 1).

## Risks
- This service is the sole issuer of JWTs used across the whole system (F1 login) and the sole owner of admin role promotion (F2b) — a mismatched or independently-regenerated `JWT_SECRET` versus `tour-service` would silently break all cross-service auth; mitigated by copying the secret verbatim (Open Question 1) and validating it explicitly (see Validation).
- `security` is included in Scope-Agents even though this ticket adds no live auth route yet, because the service's entire purpose is auth/PII/admin-role mutation (F1, F2, F2b) per `.rule/planning-rules.md`'s instruction to include `security` for anything touching auth, admin mutations, or PII — the scaffold decisions made here (JWT signing helper split, env wiring, folder layering) directly shape the security posture of every future ticket in this service.
- No admin account exists at scaffold time, and PRD F2b requires that only an existing admin can promote another user to `admin` — this creates a bootstrap gap (no one can ever become the first admin via the API alone) that must be resolved by the first feature ticket (e.g. a seed script or one-time bootstrap flag), not this scaffold; flagged here so it isn't silently forgotten.
- `tsx`/ESM moduleResolution misconfiguration is a known gotcha class per `agents/backend/CLAUDE.md` Step 2 — mitigated by reusing the config already validated in Plan 002 for `tour-service`, and by the health-check test actually exercising the boot path.

## Rollout Order
1. `backend/user-management-service/`: `package.json` + `tsconfig.json` + dependency install (step 1–2).
2. `backend/user-management-service/`: `api/lib/db.ts` + `api/lib/jwt.ts` scaffolds + env files (steps 3–4, 7–8).
3. `backend/user-management-service/`: `api/server.ts` with `/health` + domain folder layering (steps 5–6).
4. `backend/user-management-service/`: scripts + health-check test + test run validation (steps 9–11).

## Rollback
Delete the `backend/user-management-service/` directory entirely (it is newly created by this ticket, no existing code is modified) and remove any repo-root config changes made solely to support it (none expected — `backend/package.json` is a forbidden path this ticket does not touch).
