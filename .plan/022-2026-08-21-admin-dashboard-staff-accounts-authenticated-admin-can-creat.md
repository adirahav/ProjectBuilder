# Plan 022 — Admin Dashboard: Staff Accounts (authenticated Admin creates Admin/staff account)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: frontend, user-service, api-gateway, qa, security

## Goal
Implement Screen 8 (Admin Dashboard: Staff Accounts) per the PRD: an already-logged-in Admin can create an additional Admin/staff account (name, email/username, password) from inside the authenticated Admin dashboard — F12 (`POST /api/auth/register`, `user-service`, via `api-gateway`), itself gated by the same `verifyJwt` middleware plan 011 built, reachable via navigation from Screens 6/7. This is explicitly **not** a public/self-service route — plans 018 and 020 already closed out mismatched backlog items that assumed an unauthenticated Signup page, and this plan must not reopen that door.

## Scope
- In scope (`backend/user-service/api/`): extend the existing `Admin` model usage (from plan 011) with a `register`/`createAdmin(input: { name, email, password })` service function (hashes password via `bcryptjs`, rejects duplicate email with `409`), a `POST /api/auth/register` route handler in the existing auth module, validation (name/email/password required, email format, minimum password length, email uniqueness). This route itself does **not** perform its own JWT check — per plan 011's established trust boundary, `user-service` trusts that `api-gateway` has already verified the caller's JWT before forwarding (same pattern as `booking-service`'s admin routes in plan 012).
- In scope (`backend/api-gateway/api/`): extend the existing `auth-proxy` module (or add a sibling route within it) with `POST /api/auth/register`, forwarding to `user-service`, mounted **behind** `verifyJwt` in `app.ts` — unlike `POST /api/auth/login`, which stays public/unauthenticated.
- In scope (`frontend/src/`): `api/auth.ts` (or `services/auth.service.ts`) addition — `registerAdmin(input)` calling `api-gateway`'s `/api/auth/register` via the shared authenticated HTTP client (JWT attached automatically per plan 011). A new `AdminStaffAccountsPage` (Screen 8): a form (name, email/username, password, client-side validation, accessible inline errors per `accessibility-layer`), submits to `registerAdmin`, shows success/duplicate-email/validation feedback. Route `/admin/staff` wrapped in the existing `ProtectedRoute`, plus a navigation link/entry from the existing Admin dashboard nav (Screens 6/7's shared shell, if one exists, or added to both pages' nav) so the screen is reachable only from within the authenticated dashboard — never linked from any public page.
- Explicitly out of scope / must reject on review: any new **public/unauthenticated** route (no `/signup`, no `/register` outside `/admin/*`), any change to `POST /api/auth/login`'s public status, roles/permission tiers (PRD: "same Admin privileges... no separate roles/permission tiers in v1"), forgot-password/invite-link flow (explicitly excluded by PRD v1).
- Repo-relative scope: frontend changes under `frontend/src/`; backend changes under `backend/user-service/api/` (extending the existing auth module from plan 011: model/service/controller/routes); gateway changes under `backend/api-gateway/api/` (extending the existing `auth-proxy` module + `app.ts` mount). No changes to `backend/booking-service/` or `backend/notification-service/`.

## Assumptions
- Plan 011's `Admin` Mongoose model, `bcryptjs` hashing, `jsonwebtoken` issuance, `verifyJwt` middleware, and `auth-proxy` gateway module already exist and are directly reusable/extendable — this task adds a second route to each, not a new module.
- Plan 012 already established the `verifyJwt`-gated gateway-proxy pattern for a non-login route (`service-proxy`), and the same "gateway checks JWT, backend service trusts the gateway" trust boundary applies here.
- There is no "roles" concept anywhere in the existing `Admin` model or JWT claims (per plan 011: "a fixed role claim"); this task does not introduce one, matching the PRD's "no separate roles/permission tiers in v1."
- An Admin dashboard nav/shell exists or is trivially extendable from Screens 6/7 (plans 012/013) to add a link to the new Staff Accounts screen; if no shared shell exists yet, this task adds the link independently to both existing Admin pages rather than building a new shell component (kept minimal, implementer's judgment).
- Plans 018/020 already correctly closed prior backlog items that misread this feature as "add a public Signup page" — this plan supersedes that misunderstanding by implementing the real, PRD-correct, authenticated-only version of account creation.

## Open Questions
1. Should `POST /api/auth/register` live in the same `auth` route module as `POST /api/auth/login`, or a separate module?
   - Recommended: same module (`backend/user-service/api/routes/auth.js` and `backend/api-gateway/api/routes/auth.js` from plan 011) — both are "auth" concerns on the same `Admin` resource, and keeping them together avoids duplicating the `Admin` model import/validation helpers across two modules.
2. How should the gateway distinguish that `/api/auth/login` stays public while `/api/auth/register` requires `verifyJwt`, given both currently sit under one `/api/auth` mount?
   - Recommended: split the mount in `api-gateway`'s `app.ts` — apply `verifyJwt` to the specific `register` route (e.g. `router.post('/register', verifyJwt, ...)` inside the auth router, or a route-level middleware array) rather than gating the whole `/api/auth` prefix, so `login` remains reachable without a token while `register` does not. This must be covered explicitly in Validation to prevent an accidental open registration route.
3. Should the new Admin/staff account's email be required to be unique, and what happens on a duplicate?
   - Recommended: yes, unique (same as the seeded Admin's email field is already `unique` per plan 011's model) — return `409 Conflict` with a generic "account already exists" message (avoid leaking which specific field collided beyond "email").
4. Where in the Admin dashboard nav should Screen 8 be linked from?
   - Recommended: a small persistent Admin nav (Services / Appointments / Staff Accounts) added once and reused by all three authenticated pages if it doesn't already exist from plans 012/013; if a shared shell already exists, just add the third link — implementer to check current `AdminServicesPage`/`AdminAppointmentsPage` structure first rather than inventing a second nav pattern.
5. Should the created staff account be usable immediately (i.e. can log in right away) or require any additional activation step?
   - Recommended: usable immediately — PRD v1 has no invite/activation flow ("an existing Admin creates the account directly and shares the credentials out of band"), so `createAdmin` should insert an immediately-loginable account, identical in shape to the seeded one.

## Steps
1. `backend/user-service/api/models/Admin.js` — confirm `name` field exists (plan 011 only listed `email`/`passwordHash`); add `name: { type: String, required: true }` if missing, since F12 requires collecting a name.
2. `backend/user-service/api/routes/auth.js` (or wherever plan 011 put login logic) — add `createAdmin({ name, email, password })`: validate inputs, check email uniqueness, hash password via `bcryptjs`, insert new `Admin` document; add `POST /api/auth/register` handler: validate body (`400` on missing/invalid fields), call `createAdmin`, return `409` on duplicate email, `201` with the created account's public fields (never the password/hash) on success.
3. `backend/user-service/api/app.ts` — confirm the auth router already covers this new route (no remount needed if Step 2 extends the existing router file).
4. `backend/api-gateway/api/routes/auth.js` — add a `POST /register` handler forwarding to `user-service`'s `/api/auth/register`, relaying status/body, mirroring the existing `login` forward.
5. `backend/api-gateway/api/app.ts` (or the auth router itself, per Open Question 2) — apply `verifyJwt` specifically to the `register` route while leaving `login` public; add a code comment marking this split explicitly so a future edit doesn't accidentally widen or narrow it.
6. `frontend/src/api/auth.ts` — add `registerAdmin(input: { name, email, password })` calling `api-gateway`'s `/api/auth/register` via the shared authenticated HTTP client (JWT auto-attached per plan 011's interceptor).
7. `frontend/src/pages/AdminStaffAccountsPage.tsx` (or equivalent existing Admin pages folder) — form component: name/email/password fields, client-side validation (required fields, email format, minimum password length), submit calls `registerAdmin`, accessible success/error messaging (not color-only) for validation errors, duplicate-email `409`, and generic failures.
8. `frontend/src/App.tsx` — add `/admin/staff` route wrapped in the existing `ProtectedRoute`, rendering `AdminStaffAccountsPage`.
9. Admin nav — add a link to Screen 8 from the existing Admin dashboard nav (Screens 6/7), per Open Question 4's resolution; ensure the link/route is unreachable without being logged in (no link ever appears on any public page).
10. Manual verification: while logged in as Admin, navigate to Staff Accounts, create a new staff account, confirm `201` and success feedback; attempt duplicate email and confirm `409`/error message; log out, call `POST /api/auth/register` directly with no token and confirm `401`; log in with the newly created account's credentials via the existing `AdminLogin` page and confirm it authenticates identically to the seeded Admin.

## Validation
- `POST /api/auth/register` (via `api-gateway`) with a valid JWT and valid body returns `201` and the created account's public fields (no password/hash in the response).
- `POST /api/auth/register` without a token, or with an invalid/expired token, returns `401` — this is the primary security-relevant check for this task (register must NOT be reachable like the public `login` route is).
- `POST /api/auth/register` with a duplicate email returns `409`; with missing/invalid `name`/`email`/`password` returns `400`.
- `POST /api/auth/login` remains reachable with no token (unchanged from plan 011) — confirms the `verifyJwt` split (Open Question 2) didn't accidentally lock out login or leave register open.
- The newly created account can immediately log in via the existing `AdminLogin` page/`POST /api/auth/login` flow and reach the Admin dashboard exactly like the seeded account (no roles/permission tiers differentiate them).
- Frontend: `AdminStaffAccountsPage` is only reachable while authenticated (`ProtectedRoute`); the form rejects invalid input inline before submission; submitting a duplicate email surfaces an accessible, non-color-only error.
- No new public/unauthenticated route is added anywhere in `frontend/src/App.tsx` or `backend/api-gateway/api/app.ts` for account creation — this is the specific regression the PRD calls out and `security` review must explicitly confirm its absence.
- No changes leak into `backend/booking-service/` or `backend/notification-service/`.

## Risks
- **Highest-priority risk: accidental open self-registration.** The PRD explicitly calls this out as "a security regression... must be rejected in review" if built as a public route. Mitigated by gating `POST /api/auth/register` behind `verifyJwt` at the gateway (Steps 4-5) and by Validation explicitly testing the no-token-returns-401 case. `security` is included in Scope-Agents specifically to verify this route cannot be reached without a valid Admin JWT, both through the gateway and by confirming `user-service`'s own route has no independent public exposure (same trust-boundary caveat as plan 012's services routes — if `user-service` is ever reachable directly, bypassing the gateway, this route would be unauthenticated).
- **New account-creation surface reusing existing credential-handling code**: extends plan 011's `bcryptjs`/`Admin` model rather than introducing new hashing logic, minimizing new attack surface, but still merits `security` review since it's a second path that can mint valid Admin credentials.
- **No roles/permission tiers**: any created staff account has full Admin privileges (per PRD, intentional for v1) — flagged so `security` confirms this is an accepted v1 tradeoff, not an oversight, and that the UI doesn't imply otherwise.
- **Nav/discoverability**: since there's no public link (by design), if Step 9's nav link is missed, the screen would be unreachable via UI (route would still work directly). Mitigated by explicit Step 9 and Validation coverage.
- `user-service` and `api-gateway` are included in Scope-Agents because this task adds real route/service code to both, not just references to plan 011's existing auth work; `booking-service` and `notification-service` are correctly excluded as untouched.

## Rollout Order
1. `user-service`: `Admin` model `name` field check + `createAdmin` service + `POST /api/auth/register` route (Steps 1–3), verified via direct HTTP call.
2. `api-gateway`: `register` proxy route + `verifyJwt` gating split from `login` (Steps 4–5), verified via direct HTTP calls through the gateway with and without a token.
3. Frontend: `registerAdmin` API client addition (Step 6).
4. Frontend: `AdminStaffAccountsPage` + router wiring + nav link (Steps 7–9).
5. End-to-end manual verification (Step 10 / Validation), including the new-account-can-log-in check.

## Rollback
- Frontend: remove `frontend/src/pages/AdminStaffAccountsPage.tsx`, revert the `registerAdmin` addition in `frontend/src/api/auth.ts`, revert `App.tsx`'s `/admin/staff` route, revert the nav link addition.
- `api-gateway`: revert the `register` handler in `backend/api-gateway/api/routes/auth.js` and the `verifyJwt` gating added in `app.ts`/the auth router, leaving `login` untouched.
- `user-service`: revert `createAdmin` and the `POST /api/auth/register` handler in the auth route module, revert the `Admin` model's `name` field addition if it was newly added (check plan 011's original model first — only revert if this task added it).
