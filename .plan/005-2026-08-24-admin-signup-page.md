# Plan 005 — Admin Signup Page

Status: done
Owner: orchestrator
Last updated: 2026-08-24
Scope-Agents: frontend, user-management-service, qa, security

## Goal
Implement Screen 2 (Admin Signup) from the PRD: a standalone frontend page at which any visitor can create an account (full name, email, password with show/hide toggle), backed by the `POST /api/auth/signup` endpoint in `user-management-service`, always creating the account with `roles: ["user"]` and never implying admin access was granted on success.

## Scope
- In scope:
  - `frontend/`: new standalone signup page/route (not a modal), form with full name, email, password fields, show/hide password toggle, client-side validation, submit handler calling the signup API, success and inline-error states.
  - `backend/user-management-service/`: `POST /api/auth/signup` route/controller/service — validates input, hashes password, creates user document with `roles: ["user"]` (never `admin`), returns success response (and/or JWT per F1/F2 — see Open Questions), handles duplicate-email conflict.
  - Password hashing, basic input validation/sanitization, and duplicate-email handling in `user-management-service`.
- Out of scope:
  - Admin login (Screen 1 / F1) and the promote-to-admin endpoint (F2b, `PATCH /api/admins/:id/roles`) — separate PRD items, not built here (F2b's existence only informs this plan's "never grant admin" requirement).
  - Passenger flows (Screens 3–4), tour-service work, seat concurrency.
  - Any UI beyond the signup page itself (e.g., the Gateway screen linking to it) unless a minimal link/route wiring is required for the page to be reachable — included minimally in Steps.

## Assumptions
- `frontend/` (Vite + React + TS + Tailwind v4 + Zustand, per plan 001) and `backend/user-management-service/` (Express + Mongoose, per plan 003) are already scaffolded with dependencies installed (plan 004), so this plan only adds feature code, not project setup.
- `user-management-service` already has (or this plan adds, if missing) a `User`/`Admin` model per `mongoose-models-layer` skill conventions with a `roles: string[]` field defaulting away from `admin`.
- No design mockups exist for this screen (PRD states "No external design source is provided... Design the UI yourself per `.rule/style-rules.md`"), so the frontend agent designs the signup page visually within `.rule/style-rules.md` and the `css-layer`/`ui-component-layer`/`accessibility-layer` skill conventions.
- JWT signing/secret infrastructure either already exists in `user-management-service` (from earlier scaffold work) or is stubbed consistently with what F1 (login) will need later, per `jwt-middleware-layer` skill guidance.

## Open Questions
1. Does successful signup log the user in immediately (return a JWT, per F2 route table entry) or just show a success message requiring separate login?
- Recommended: return a JWT on signup (matches F2's route mapping and typical UX), but the frontend must not treat this JWT as admin-authorizing — store it as a regular authenticated `user` session, and the success UI must show a neutral "account created" message with no admin-dashboard redirect or admin-implying language.

2. What password strength/validation rules apply (min length, complexity)?
- Recommended: minimum 8 characters with at least one letter and one number, enforced both client-side (immediate feedback) and server-side (authoritative), since the PRD doesn't specify exact rules and this is a reasonable baseline that `security` review can tighten later.

3. Where does the signup page live in the route hierarchy, and how is it reached from the Gateway (Screen 1)?
- Recommended: route it at `/signup` in the frontend router, with a plain link/button from the Gateway screen ("Sign up" or similar) — Gateway itself is out of scope for full implementation here, so only add the minimal link if the Gateway component already exists; otherwise note it as a follow-up.

## Steps
1. `backend/user-management-service/`: define/confirm `User` model (full name, email — unique, password hash, `roles: ["user"]` default) per `mongoose-models-layer` skill.
2. `backend/user-management-service/`: implement `POST /api/auth/signup` — validate body, check email uniqueness (409 on conflict), hash password (bcrypt or equivalent), persist user with `roles: ["user"]`, return success payload (+ JWT per Open Question 1 resolution) per `service-layer`/`jwt-middleware-layer`/`backend-service-layer` skills.
3. `backend/user-management-service/`: add unit/integration tests for the signup route (happy path, duplicate email, weak password, missing fields).
4. `frontend/`: build the standalone Signup page component — full name, email, password fields, show/hide password toggle, client-side validation, submit calling the API via the `api-layer` skill conventions, inline error display (e.g., duplicate email), success state that does not imply admin access.
5. `frontend/`: wire `/signup` route; add minimal link from Gateway if it already exists.
6. `frontend/`: apply `css-layer` (Tailwind utility-first) and `accessibility-layer` conventions (labeled inputs, accessible show/hide toggle, error announcements).
7. `frontend/`: add/update Zustand slice if signup needs to set auth/session state post-signup, per `state-management-layer` skill.
8. Cross-service: confirm frontend's expected response shape matches backend's actual signup response (status/JWT/user object) before marking done.

## Validation
- `POST /api/auth/signup` with valid data creates a user with `roles: ["user"]` (never `admin`), confirmed via direct DB/model assertion in a backend test.
- Duplicate-email signup returns a 409/conflict with a clear error, surfaced inline on the frontend form without page navigation.
- Weak/missing-field submissions are rejected both client- and server-side with appropriate messages.
- Password show/hide toggle functions and the input has correct `type`/`aria` attributes.
- Success screen/message contains no language or navigation implying admin access was granted (manual/QA review against PRD wording).
- `qa` agent runs through the signup flow end-to-end (frontend form → backend → DB) and confirms accessibility basics (labels, focus, error announcements).
- `security` agent reviews password handling (hashing, no plaintext logging/storage), input validation, and confirms no code path can set `roles` to `admin` from this endpoint.

## Risks
- Role-escalation risk: any bug that lets client-supplied input influence the `roles` field on signup would silently grant admin access — mitigate by hard-coding `roles: ["user"]` server-side, ignoring any `roles`/`isAdmin` field in the request body, and covering this explicitly in both backend tests and `security` review.
- Password/PII handling risk: passwords and emails are sensitive; hashing must be correct (bcrypt/argon2, not reversible), and errors/logs must not leak plaintext passwords — `security` scope is required here.
- Duplicate-email race condition: near-simultaneous signups with the same email could both pass a pre-check; rely on a unique index at the DB level, not just an application-level check, to guarantee correctness.
- UX risk of implying admin access: since F2b explicitly forbids granting admin on signup, wording on the success screen must be reviewed carefully (covered in Validation).

## Rollout Order
1. Backend model + `POST /api/auth/signup` route + tests (Steps 1–3).
2. Frontend signup page + routing + styling + accessibility (Steps 4–6).
3. Frontend state wiring (Step 7).
4. Cross-service contract confirmation (Step 8).
5. QA end-to-end validation, then security review.

## Rollback
Remove the `/signup` frontend route/page and the `POST /api/auth/signup` backend route/controller/tests; drop any `User` model additions made solely for this feature if not yet relied upon by other completed work (check plan 003's scaffold scope first, since the base model may predate this plan).
