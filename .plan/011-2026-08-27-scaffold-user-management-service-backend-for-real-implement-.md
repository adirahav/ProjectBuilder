# Plan 011 — Scaffold user-management-service backend for real + implement admin signup endpoint

Status: done
Owner: orchestrator
Last updated: 2026-08-27
Scope-Agents: frontend, user-management-service, qa, security

## Goal
Actually build `backend/user-management-service/` on disk (it still does not exist — `ls backend/` shows only `tour-service`) and implement `POST /api/auth/signup` per PRD F2/F2b, so the already-built frontend signup page (`frontend/src/pages/SignupPage.tsx`, `frontend/src/services/auth.service.ts`, `frontend/src/types/auth.types.ts`) has a real, working API instead of failing every request. This closes the gap left by plan 003 and plan 010, both of which describe this work but were never executed against the filesystem.

## Scope
- In scope:
  - `backend/user-management-service/`: fresh scaffold mirroring `backend/tour-service/`'s established structure (`package.json`, `tsconfig.json`, `vitest.config.ts`, `api/server.ts`, `api/app.ts`, `api/lib/{config,db,jwt,errors,error.middleware,auth.middleware}.ts`) — Express + Mongoose + `MONGODB_URI` + JWT signing (this service both signs and verifies, unlike `tour-service` which only verifies, per `jwt-middleware-layer` skill).
  - `backend/user-management-service/`: `User` Mongoose model (`fullName`, `email` unique index, `passwordHash`, `roles: string[]` default `["user"]`) per `mongoose-models-layer` skill.
  - `backend/user-management-service/`: `POST /api/auth/signup` route/controller/service — validation, email-uniqueness/409, bcrypt password hashing, hardcoded `roles: ["user"]` (server ignores any client-supplied `roles`/`isAdmin`), JWT issuance, response shaped as `{ token, user: { id, fullName, email, roles } }` exactly matching `SignupResponse` in `frontend/src/types/auth.types.ts`.
  - `backend/user-management-service/`: `GET /health` mounted first, no auth, no DB touch, matching `tour-service`'s pattern.
  - CORS/env wiring so the frontend's configured base URL for `user-management-service` resolves correctly in dev.
  - Verify (not rebuild) `frontend/src/pages/SignupPage.tsx` and its existing test/service layer against the real backend; fix only genuine contract mismatches found during integration.
  - Mark plan 003 and plan 010 `Status: superseded`, pointing to this plan, once this plan is approved and executed — consolidating the true history in one place instead of three plans describing the same unbuilt work.
- Out of scope:
  - Admin login (`POST /api/auth/login`, F1) — separate backlog item (plan 006 territory); reuse the JWT/User-model infrastructure built here but do not implement the `/login` handler.
  - `PATCH /api/admins/:id/roles` (F2b promotion) — separate backlog item.
  - Passenger flows, `tour-service`, seat concurrency — untouched by this plan.
  - Redesigning the signup UI — it already exists and matches `.rule/style-rules.md`/`accessibility-layer` conventions.

## Assumptions
- `backend/user-management-service/` is confirmed absent on disk right now (`ls backend/` → only `tour-service`) — plans 003 and 010 both claimed/attempted this but neither left code in the repo, so this plan starts from zero rather than trusting either plan's stated status.
- `backend/tour-service/` (present, working) is the structural template to mirror: `package.json` dependency set, `api/app.ts` + `api/server.ts` split, `api/lib/{config,db,jwt,errors,error.middleware}.ts` layering, Vitest + Supertest + `mongodb-memory-server` for tests.
- The frontend's request/response contract (`frontend/src/types/auth.types.ts`, `frontend/src/services/auth.service.ts`) is the authoritative API shape to build against — it already sends `{ fullName, email, password }` and expects `{ token, user: { id, fullName, email, roles } }` back, with a `ConflictError` path keyed off 409.
- Server-side password validation mirrors the frontend's existing rule (min 8 characters, at least one letter and one number, per `auth.utils.ts`) so client and server never disagree.
- `JWT_SECRET` for this service must match `backend/tour-service/.env`'s value byte-for-byte, since `tour-service` will need to verify tokens this service issues.

## Open Questions
1. Should this plan supersede plans 003 and 010 outright, or leave them as-is and just execute the work under a new number?
- Recommended: mark both `Status: superseded` pointing to this plan (Step 8 below) once this plan's work lands — three plans describing the same never-built service is worse than one accurate record, and neither prior plan's design decisions conflict with this one.

2. What password strength rule applies server-side?
- Recommended: mirror the frontend exactly — min 8 characters, at least one letter, at least one number — enforced in the backend validator, not just trusted from the client.

3. Should the signup response transform Mongoose's `_id` to `id`?
- Recommended: yes, in a response serializer, so the frontend's `AuthUser` type and `useStore().setSession()` work unmodified; any other field-name mismatch found during integration testing is a backend bug to fix, not a frontend rewrite.

4. Should `MONGODB_URI` point at a real database or a placeholder for this ticket?
- Recommended: placeholder/local dev value (e.g. `mongodb://localhost:27017/hila-tours-user-management-service`), consistent with `tour-service`'s approach — tests use `mongodb-memory-server` so they don't depend on a live database.

## Steps
1. `backend/user-management-service/`: `npm init` + `package.json` mirroring `backend/tour-service/package.json`'s dependency set (`express`, `mongoose`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`, `tsx`; dev: `typescript`, `vitest`, `supertest`, `mongodb-memory-server`, relevant `@types/*`) with `dev`/`start`/`test`/`typecheck` scripts.
2. `backend/user-management-service/tsconfig.json` and `vitest.config.ts`: copy `tour-service`'s working config.
3. `backend/user-management-service/api/lib/config.ts`, `db.ts`: env-driven config object and Mongoose connection helper reading `MONGODB_URI`, `PORT` (`4002`), `FRONTEND_ORIGIN`, `JWT_SECRET`, `JWT_EXPIRES_IN` — no hardcoded credentials.
4. `backend/user-management-service/api/lib/jwt.ts`: `signToken()` and `verifyToken()` (this service issues tokens, unlike `tour-service`'s verify-only stub).
5. `backend/user-management-service/api/lib/errors.ts`, `error.middleware.ts`: mirror `tour-service`'s error-shape conventions so `ConflictError`/`400` responses match what `frontend/src/services/http.service.ts` already expects.
6. `backend/user-management-service/api/models/user.model.ts`: `User` schema — `fullName` (string, required), `email` (string, required, unique index, lowercased), `passwordHash` (string, required, never serialized), `roles` (string array, default `["user"]`).
7. `backend/user-management-service/api/auth/`: `auth.service.ts` (validate input incl. password rule from Open Question 2, check email uniqueness, bcrypt-hash password, persist user with hardcoded `roles: ["user"]` — explicitly discard any request-body `roles`/`isAdmin`, sign JWT), `auth.controller.ts`, `auth.routes.ts` wiring `POST /api/auth/signup`, response serialized `_id → id` (Open Question 3).
8. `backend/user-management-service/api/app.ts`, `server.ts`: Express app — CORS restricted to `FRONTEND_ORIGIN`, `GET /health` mounted first (no auth, no DB), signup route mounted under `/api/auth`, error middleware last; `server.ts` calls `connectDb()` then `listen(config.port)`.
9. `backend/user-management-service/.env.example` and `.env`: `MONGODB_URI` (placeholder per Open Question 4), `JWT_SECRET` (copied verbatim from `backend/tour-service/.env`), `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN=http://localhost:5173`, `PORT=4002`.
10. `backend/user-management-service/`: tests (Vitest + Supertest + `mongodb-memory-server`) — `GET /health` returns 200 no-auth; signup happy path returns `{ token, user }` with `roles: ["user"]`; duplicate email → 409; weak password → 400; missing fields → 400; request body `roles: ["admin"]` is ignored and persisted role stays `["user"]`.
11. Frontend integration: run `frontend/src/pages/SignupPage.test.tsx` and a manual pass of the real form against the running backend (both dev servers started together); fix only genuine contract mismatches found (field names, error `code`), not stylistic changes.
12. `backend/user-management-service/`: run `npm run test` and confirm 100% pass; run `npm run typecheck`.
13. Update `.plan/003-2026-08-24-scaffold-user-management-service-backend-project-package-jso.md` and `.plan/010-2026-08-27-admin-signup-page.md` `Status` to `superseded`, linking to this plan (011).

## Validation
- `npm --prefix backend/user-management-service run test` passes 100%, including the duplicate-email/weak-password/roles-ignored cases from Step 10.
- `npm --prefix backend/user-management-service run typecheck` passes with no errors.
- Manual `GET /health` returns 200 with no auth header, mounted before any other middleware.
- Manual signup via the running frontend against the running backend: valid data creates a `roles: ["user"]` account and lands on the non-admin-implying success screen; duplicate email shows the frontend's existing inline Hebrew error with no navigation; weak/missing fields rejected both client- and server-side.
- `frontend/src/pages/SignupPage.test.tsx` continues to pass unmodified, or with only documented, justified changes.
- `security` agent confirms: bcrypt hashing (not reversible), `JWT_SECRET` not committed with a real production value, no code path lets client input set `roles` to `admin` on signup.
- `qa` agent runs the signup flow end-to-end (real form → real backend → real DB) and confirms accessibility basics (labels, focus, error announcements) hold with live data.

## Risks
- Role-escalation risk: any bug letting client-supplied input influence `roles` on signup would silently grant admin access — mitigated by hardcoding `roles: ["user"]` server-side and covering it explicitly in tests (Step 10) and `security` review. `security` is included in Scope-Agents for this reason.
- PII/password handling risk: emails and passwords are sensitive; hashing must be correct (bcrypt) and `JWT_SECRET` must never be committed with a real value — another reason `security` is in scope.
- Duplicate-email race condition: rely on MongoDB's unique index on `email`, not just an application-level pre-check, so near-simultaneous signups can't both succeed.
- Contract-drift risk: the frontend was built against an assumed contract with no real backend to verify against until now — Step 11 may surface mismatches requiring a small, scoped fix on either side.
- Repeat-of-history risk: this is the third plan (003, 010, 011) describing this exact backend; if this plan is also marked "done" without the code actually landing and being verified, the same gap will recur — Step 12's test run and Step 11's live integration pass are the concrete proof-of-work this plan requires before any "done" status is set.

## Rollout Order
1. Backend scaffold (`package.json`, `tsconfig.json`, `vitest.config.ts`) — Steps 1–2.
2. Config/db/jwt/error infra — Steps 3–5.
3. `User` model — Step 6.
4. Signup route/controller/service — Step 7.
5. App wiring (`app.ts`/`server.ts`) + env files — Steps 8–9.
6. Backend tests + typecheck — Steps 10, 12.
7. Frontend integration verification — Step 11.
8. Supersede plans 003 and 010 — Step 13.
9. QA end-to-end validation, then security review.

## Rollback
Delete `backend/user-management-service/` entirely (it does not exist today, so this fully reverts to the pre-plan state). Revert the `Status` fields of plans 003 and 010 back to their prior values if Step 13 was already applied. No `frontend/` changes are expected beyond fixing genuine contract mismatches (Step 11); if any were made, revert those specific edits only.
