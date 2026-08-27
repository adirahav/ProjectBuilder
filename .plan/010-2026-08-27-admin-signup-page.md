# Plan 010 — Admin Signup Page

Status: active
Owner: orchestrator
Last updated: 2026-08-27
Scope-Agents: frontend, user-management-service, qa, security

## Goal
Complete Screen 2 (Admin Signup) from the PRD by standing up the missing `user-management-service` backend and its `POST /api/auth/signup` endpoint, so the already-built frontend signup page (`frontend/src/pages/SignupPage.tsx`) has a real API to call instead of failing at runtime. The account must always be created with `roles: ["user"]` and never imply admin access was granted.

## Scope
- In scope:
  - `backend/user-management-service/`: this directory does not exist yet (confirmed empty — no `package.json`, no `src/`, no `node_modules/`), despite plan 003 ("Scaffold user-management-service backend project") and plan 005 ("Admin signup page", `Status: done`) both claiming this work was completed. This plan scaffolds the service from scratch (`package.json`, Express app, Mongoose connection via `MONGODB_URI`, JWT signing) and implements `POST /api/auth/signup` against the exact request/response contract the frontend already codes to (`frontend/src/types/auth.types.ts`, `frontend/src/services/auth.service.ts`, `frontend/src/services/http.service.ts`).
  - `backend/user-management-service/`: `User` model (`fullName`, `email` — unique index, password hash, `roles: string[]` defaulting to `["user"]`) per `mongoose-models-layer` skill.
  - `backend/user-management-service/`: signup route/controller/service — input validation, email-uniqueness/409 handling, password hashing, hardcoded `roles: ["user"]` (ignoring any client-supplied `roles`/`isAdmin` field), JWT issuance, response shaped as `{ token, user: { id, fullName, email, roles } }` to match `SignupResponse`.
  - `backend/user-management-service/`: CORS/env config so the already-configured `VITE_USER_SERVICE_BASE_URL` in the frontend resolves to this service in dev.
  - Verify (do not rebuild) the existing `frontend/src/pages/SignupPage.tsx`, `SignupPage.test.tsx`, `auth.service.ts`, `http.service.ts`, `auth.utils.ts` against the real backend; fix only genuine contract mismatches discovered during integration (e.g., response field naming), not stylistic rewrites.
- Out of scope:
  - Admin login (`POST /api/auth/login`, Screen 1/F1) — the route is referenced by `auth.service.ts` already but its backend implementation belongs to plan 006 (Gateway login screen), not this plan. If scaffolding the service naturally stands up shared auth infrastructure (JWT util, `User` model), reuse it, but do not implement the `/login` handler here.
  - The promote-to-admin endpoint (`PATCH /api/admins/:id/roles`, F2b) — separate backlog item.
  - Passenger flows, tour-service, seat concurrency.
  - Redesigning the signup UI — it already exists and matches `.rule/style-rules.md`/`accessibility-layer` conventions; only wire/fix, don't redo.

## Assumptions
- `frontend/` is already scaffolded and the Signup page is fully built and tested against a mocked/expected API contract — confirmed by reading `frontend/src/pages/SignupPage.tsx`, `frontend/src/services/auth.service.ts`, and `frontend/src/types/auth.types.ts` directly; this plan must match that existing contract rather than inventing a new one.
- Plan 003 and plan 005 marked `user-management-service` work as scaffolded/done, but the filesystem shows `backend/user-management-service/` does not exist at all — treating those plans' "done" status as inaccurate for this repo state and re-verifying from scratch is the safer assumption than trusting the stale status.
- `backend/tour-service/` shows a pattern to mirror for scaffolding (Express + Mongoose + `MONGODB_URI`, per plan 002), so `user-management-service` should follow the same structural conventions (folder layout, env handling, start scripts) for consistency.
- JWT secret/signing convention does not yet exist anywhere in the repo (no prior service implements it) — this plan defines it per `jwt-middleware-layer` skill guidance, and plan 006 (login) will reuse the same convention rather than inventing a second one.

## Open Questions
1. Plans 003/005 claim this backend work is done, but it isn't on disk — should this plan proceed as a fresh build, or should plans 003/005 be marked `superseded` first?
- Recommended: proceed as a fresh build under this plan number (010), and mark plan 005 `Status: superseded` pointing to this plan once this plan is approved, since plan 005's design decisions (JWT-on-signup, `/signup` route, password rules) are still valid and don't need to be re-litigated — only re-executed for the backend half.

2. What password strength/validation rules apply server-side (the frontend already enforces min 8 chars + 1 letter + 1 number via `validatePassword` in `auth.utils.ts`)?
- Recommended: mirror the frontend's existing rule (min 8 characters, at least one letter and one number) server-side as the authoritative check, so client and server never disagree.

3. Does the signup response need to match `SignupResponse` (`{ token, user: { id, fullName, email, roles } }`) exactly, including field name `id` (not `_id`)?
- Recommended: yes — transform Mongoose's `_id` to `id` in the response serializer so the frontend's existing `AuthUser` type and `useStore().setSession()` call work unmodified; treat any deviation found during integration testing as a bug to fix on the backend, not the frontend.

## Steps
1. `backend/user-management-service/`: scaffold `package.json`, TypeScript/Node config, Express app entrypoint, Mongoose connection via `MONGODB_URI` env var, and start/dev scripts — mirroring `backend/tour-service/`'s structure per plan 002 and the `backend-service-layer` skill.
2. `backend/user-management-service/`: define `User` model (`fullName`, `email` unique index, `passwordHash`, `roles: string[]` default `["user"]`) per `mongoose-models-layer` skill.
3. `backend/user-management-service/`: add JWT signing utility (secret from env, payload includes `id`/`roles`) per `jwt-middleware-layer` skill, reusable by the future login endpoint.
4. `backend/user-management-service/`: implement `POST /api/auth/signup` — validate body (full name, email format, password per Open Question 2), check email uniqueness (409 with a stable error `code` the frontend's `ConflictError` path can key off), hash password (bcrypt), persist user with hardcoded `roles: ["user"]` (explicitly discard any request-body `roles`/`isAdmin`), issue JWT, respond with `{ token, user: { id, fullName, email, roles } }` per `service-layer` skill.
5. `backend/user-management-service/`: add CORS config allowing the frontend dev origin, and confirm the service listens on the port `VITE_USER_SERVICE_BASE_URL` expects in `frontend/.env` (or equivalent env file).
6. `backend/user-management-service/`: add unit/integration tests for the signup route (happy path, duplicate email → 409, weak password → 400, missing fields → 400, confirm persisted `roles` is always `["user"]` even if `roles: ["admin"]` is sent in the request body).
7. Cross-service: run the existing `frontend/src/pages/SignupPage.test.tsx` plus a manual/integration pass of the real form against the running backend; fix any genuine contract mismatch found (response shape, error `code`/`message` fields the frontend keys off), without rewriting the page's structure.
8. Update `.plan/005-2026-08-24-admin-signup-page.md`'s `Status` to `superseded` with a link to this plan, per the Supersession Rule, once this plan's backend work is complete.

## Validation
- `POST /api/auth/signup` with valid data creates a user with `roles: ["user"]` in MongoDB, confirmed via a backend test that also sends `roles: ["admin"]` in the body and asserts it's ignored.
- Duplicate-email signup returns 409, and the frontend's existing `ConflictError` handling shows the inline "email already registered" (Hebrew) message with no page navigation — verified by running the actual UI against the real backend, not just the mocked test.
- Weak/missing-field submissions are rejected both client-side (already implemented) and server-side (this plan), with matching validation rules.
- `frontend/src/pages/SignupPage.test.tsx` continues to pass unmodified (or with only justified, documented changes).
- Success screen shows no admin-implying language or redirect (already implemented in `SignupSuccess`; re-confirm unchanged).
- `qa` agent runs the signup flow end-to-end (real frontend form → real backend → real DB) and confirms accessibility basics (labels, focus, error announcements) still hold with live data.
- `security` agent reviews password hashing, input validation, JWT secret handling, and confirms no code path can set `roles` to `admin` from this endpoint.

## Risks
- Role-escalation risk: any bug letting client-supplied input influence the `roles` field on signup would silently grant admin access — mitigated by hardcoding `roles: ["user"]` server-side and covering it explicitly in backend tests and `security` review.
- Password/PII handling risk: passwords and emails are sensitive; hashing must be correct (bcrypt, not reversible) and JWT secret must not be committed to the repo — `security` scope is required here.
- Duplicate-email race condition: near-simultaneous signups with the same email could both pass an application-level pre-check; rely on a unique MongoDB index, not just a query-then-insert check.
- Contract-drift risk: the frontend was built against an assumed API contract with no real backend to verify against — integration testing (Step 7) may surface mismatches (field names, error codes) that require a small, scoped backend or frontend fix.
- Stale-status risk: plans 003 and 005 are marked `done` but the corresponding backend code doesn't exist on disk — this plan treats that disconnect as a known data point (Open Question 1) rather than silently re-deriving conflicting history.

## Rollout Order
1. Backend scaffold (`package.json`, Express, Mongoose connection) — Step 1.
2. `User` model + JWT utility — Steps 2–3.
3. `POST /api/auth/signup` route + tests — Steps 4, 6.
4. CORS/env wiring so frontend can reach the service — Step 5.
5. Cross-service integration verification against the existing frontend — Step 7.
6. Supersede plan 005 — Step 8.
7. QA end-to-end validation, then security review.

## Rollback
Remove `backend/user-management-service/` entirely (it does not exist today, so this fully reverts to the pre-plan state) and revert `.plan/005-2026-08-24-admin-signup-page.md`'s `Status` back to `done` if Step 8 was already applied. No changes to `frontend/` are expected to be needed beyond fixing genuine contract mismatches (Step 7); if any were made, revert those specific edits.
