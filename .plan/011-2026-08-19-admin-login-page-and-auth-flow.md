# Plan 011 — Admin Login page and auth flow

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-19
- Scope-Agents: frontend, user-service, api-gateway, qa, security

## Goal
Implement Screen 5 (Admin Login) end-to-end per the PRD: a single-Admin email/username + password login form (F5) that authenticates against `user-service` via `api-gateway`, stores the issued JWT on success, redirects to the Admin dashboard, and establishes the `ProtectedRoute` guard/JWT-verification middleware that all future Admin screens (Screens 6–7) will depend on.

## Scope
- In scope (`backend/user-service/`): an `Admin` Mongoose model (single-document/single-role account — email or username, hashed password via the already-installed `bcryptjs`), a seed/bootstrap mechanism for the one Admin account (script or env-driven, since there is no self-registration flow in v1), `POST /api/auth/login` route — validates credentials, compares password hash, issues a JWT (via the already-installed `jsonwebtoken`) with a reasonable expiry, returns `401` on invalid credentials.
- In scope (`backend/api-gateway/`): JWT verification middleware (using `jsonwebtoken`, already installed) that validates the `Authorization: Bearer <token>` header on Admin-only routes; a proxy/forward route for `POST /api/auth/login` through to `user-service` (this one route is unauthenticated, since it's how the JWT is obtained); wiring the middleware so it is ready to gate future Admin routes (Screens 6–7), even though this task adds no protected business routes yet.
- In scope (`frontend/src/`): an `auth` Zustand slice (JWT token, admin identity, `login`/`logout` actions, persisted to `localStorage` so a refresh doesn't force re-login), `frontend/src/api/auth.ts` (`login(credentials)` calling `api-gateway`'s `/api/auth/login`), an `AdminLogin` page (email/username + password form, client-side validation, accessible error messaging per `accessibility-layer`, RTL/LTR layout per `css-layer`, styling per `ui-component-layer`), a `ProtectedRoute` component that checks the auth slice and redirects unauthenticated access to `/admin/login`, router wiring for `/admin/login` (public) and a placeholder `/admin` route wrapped in `ProtectedRoute` (the real Admin dashboard content is out of scope — this task only proves the guard redirects correctly), an axios/fetch interceptor or helper that attaches the stored JWT to future authenticated requests.
- Out of scope: Admin Dashboard: Services (Screen 6, F6–F8), Admin Dashboard: Appointments (Screen 7, F9–F11), any Admin self-registration/password-reset flow, refresh-token rotation (a single non-refreshing JWT with expiry is sufficient for v1), rate-limiting/lockout on repeated failed logins (flagged as a risk, not implemented here).
- Repo-relative scope: frontend changes under `frontend/src/`; backend changes under `backend/user-service/api/` (or equivalent existing source root) and `backend/api-gateway/api/`. No changes to `backend/booking-service/` or `backend/notification-service/`.

## Assumptions
- `user-service` and `api-gateway` were deliberately scaffolded (plans 003/005) with `bcryptjs`/`jsonwebtoken` installed but unwired, and both `app.ts` files explicitly defer this exact work to "the follow-up JWT-middleware and routing tickets" — this plan is that follow-up.
- There is exactly one Admin account in v1 (per PRD: "the single Admin"), so no registration UI/route is needed; the account is created via a seed script or one-time bootstrap (see Open Questions).
- The frontend has no `router.tsx`; routing lives in `frontend/src/App.tsx`'s `AppRoutes`, which already documents that `/admin`, `/admin/appointments`, `/admin/login` land with the Admin tickets — this task adds `/admin/login` and a guarded `/admin` placeholder, consistent with that documented plan.
- `api-gateway` has no proxy library installed yet; a minimal hand-rolled forward (fetch/axios call to `user-service` from within the gateway route handler) is acceptable for this one route rather than pulling in a new dependency, consistent with the gateway's currently minimal footprint.
- JWT payload only needs to carry enough to identify "the Admin" (e.g. a fixed role claim) since there's no multi-user Admin model to distinguish.

## Open Questions
1. How should the single Admin account be provisioned (no self-registration exists)?
   - Recommended: a seed script in `backend/user-service` (e.g. `npm run seed:admin`) reading `ADMIN_EMAIL`/`ADMIN_PASSWORD` from environment variables, hashing the password with `bcryptjs`, and upserting the one `Admin` document — run manually/once per environment rather than on every server boot.
2. What should the JWT expiry be, and should logout be purely client-side?
   - Recommended: a 24-hour expiry (long enough for a single admin's daily use, short enough to bound a leaked-token blast radius), with logout implemented as clearing the client-stored token only (no server-side blacklist in v1, consistent with no refresh-token rotation).
3. Should `api-gateway` proxy `POST /api/auth/login` to `user-service`, or should the frontend call `user-service` directly (as the public booking screens currently call `booking-service` directly per plans 007–009)?
   - Recommended: proxy through `api-gateway`, because F5's requirement table explicitly lists the route as "`user-service`, via `api-gateway`" (unlike F1–F4b which list `booking-service` directly) and because the gateway's JWT verification middleware needs to exist here regardless for future Admin routes — starting the proxy pattern now avoids a rework when Screens 6–7 land.
4. Where should the JWT be stored client-side — `localStorage` or an in-memory-only store?
   - Recommended: `localStorage` (via Zustand persist middleware), accepting the standard XSS-exfiltration tradeoff, because the PRD explicitly says Screen 5 "stores the issued JWT" and a page-refresh-proof session is expected UX for an Admin dashboard; `security` review should confirm this tradeoff is acceptable for v1.

## Steps
1. `backend/user-service/api/models/Admin.js` — Mongoose schema: `email` (String, required, unique), `passwordHash` (String, required), timestamps. No public create/update route in this task.
2. `backend/user-service/api/scripts/seedAdmin.js` (or equivalent existing scripts location) — one-time seed script reading `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars, hashing via `bcryptjs`, upserting the `Admin` document; add an `npm run seed:admin` script to `backend/user-service/package.json`.
3. `backend/user-service/api/routes/auth.js` — `POST /api/auth/login` handler: validate body (email/password required), look up `Admin` by email, compare password hash via `bcryptjs`, on mismatch/not-found return `401` with a generic "invalid credentials" message (no user-enumeration hints), on success sign a JWT via `jsonwebtoken` (claims: admin id, fixed role, expiry per Open Question 2) and return `200` with the token.
4. `backend/user-service/api/app.ts` — mount the new auth router under `/api/auth`, replacing the scaffold comment that deferred this work.
5. `backend/api-gateway/api/middleware/verifyJwt.js` — middleware verifying `Authorization: Bearer <token>` via `jsonwebtoken` against a shared secret/env var, attaching decoded claims to the request or returning `401`; exported for reuse by future Admin routes (Screens 6–7), not yet applied to any route besides being ready.
6. `backend/api-gateway/api/routes/auth.js` — `POST /api/auth/login` handler: forwards the request body to `user-service`'s `/api/auth/login` (no JWT check on this one route, since it's how the token is obtained) and relays the response/status back to the client.
7. `backend/api-gateway/api/app.ts` — mount the new auth router under `/api/auth`, replacing the scaffold comment that deferred this work.
8. `frontend/src/store/auth.ts` — new Zustand slice: `token`, `admin` (decoded identity or null), `login(token)`/`logout()` actions, persisted to `localStorage`.
9. `frontend/src/store/store.ts` — add the `auth` slice to `RootState` per its existing "one member, one spread" comment.
10. `frontend/src/api/auth.ts` — `loginAdmin(credentials)` function calling `api-gateway`'s `/api/auth/login`, typed request/response.
11. `frontend/src/api/client.ts` (or wherever the shared axios instance lives) — attach the stored JWT as an `Authorization` header on outgoing requests when present, for future authenticated Admin calls.
12. `frontend/src/pages/AdminLogin/AdminLogin.tsx` — page component: email/username + password fields, client-side required-field validation, submit calls `loginAdmin`, on success calls the auth store's `login` action and navigates to `/admin`, on `401` shows an accessible inline error (not color-only), RTL/LTR-correct per `css-layer`, mobile/desktop responsive per `ui-component-layer`.
13. `frontend/src/components/ProtectedRoute.tsx` — guard component: reads the auth store, renders `children`/`Outlet` if a token is present, otherwise redirects to `/admin/login`.
14. `frontend/src/App.tsx` — add `/admin/login` (public, renders `AdminLogin`) and `/admin` (wrapped in `ProtectedRoute`, renders a minimal placeholder pending Screen 6) routes, replacing the scaffold comment that deferred Admin routing.
15. Manual verification: seed an Admin account, log in with correct credentials and confirm redirect to `/admin` with a token stored, log in with wrong credentials and confirm the `401`/error message, hit `/admin` directly with no token and confirm redirect to `/admin/login`, refresh the page after login and confirm the session persists.

## Validation
- `POST /api/auth/login` (via `api-gateway`) with correct credentials returns `200` and a JWT; the token verifies successfully against `verifyJwt` middleware.
- `POST /api/auth/login` with incorrect password or unknown email returns `401` with a generic message that does not reveal whether the email exists.
- `POST /api/auth/login` with missing fields returns `400`.
- `api-gateway`'s `verifyJwt` middleware rejects requests with a missing, malformed, or expired `Authorization` header with `401`, and accepts a valid one, attaching decoded claims.
- Frontend: submitting valid credentials on `AdminLogin` stores the JWT and navigates to `/admin`; submitting invalid credentials shows an accessible error and does not navigate; visiting `/admin` without a stored token redirects to `/admin/login`; after login, a page refresh keeps the admin authenticated (persisted store).
- Keyboard-only navigation can reach and submit the login form; the error message is associated with the form for screen readers (not color-only).
- No changes leak into `backend/booking-service/` or `backend/notification-service/`.

## Risks
- **New authentication surface with credential handling**: this is the system's only login endpoint and the root of trust for every future Admin mutation (Screens 6–7). Mitigated by hashing with `bcryptjs`, generic `401` messaging to avoid user enumeration, and JWT expiry (Open Question 2). `security` is included in Scope-Agents specifically to review the login route, JWT secret handling/env-var storage, and the `localStorage` token-storage tradeoff (Open Question 4).
- **`api-gateway` becomes the first real security boundary in the system**: prior plans (007–009) called `booking-service` directly with no gateway involved; this task introduces the first JWT-verification middleware and the first proxy route, which the entire Admin surface will depend on going forward. `api-gateway` is included in Scope-Agents because this task adds real code to it, not merely references it.
- **No rate-limiting/lockout on repeated failed logins**: a brute-force risk against the single Admin account, explicitly deferred out of scope for v1 but called out here so `security` can flag it as a follow-up rather than a silent gap.
- **Seed-only account provisioning is a manual, easy-to-forget step**: if the seed script isn't run in an environment, login will always fail with no self-service recovery path; mitigated by documenting the `npm run seed:admin` step clearly in Steps/Rollout.
- No `booking-service` or `notification-service` code is touched, so they are correctly excluded from Scope-Agents.

## Rollout Order
1. `user-service`: `Admin` model + seed script (Steps 1–2), run the seed once to create the test Admin account.
2. `user-service`: `POST /api/auth/login` route + mount (Steps 3–4), verified via direct HTTP call.
3. `api-gateway`: JWT middleware + proxy login route + mount (Steps 5–7), verified via direct HTTP call through the gateway.
4. Frontend: auth store + API client + interceptor (Steps 8–11).
5. Frontend: `AdminLogin` page + `ProtectedRoute` + router wiring (Steps 12–14).
6. End-to-end manual verification against all three running services (Step 15 / Validation).

## Rollback
- Frontend: remove `frontend/src/pages/AdminLogin/`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/api/auth.ts`, revert `frontend/src/store/auth.ts` and its `store.ts` addition, revert the `Authorization` header attachment in `frontend/src/api/client.ts`, and revert `App.tsx`'s `/admin/login` and `/admin` route additions back to the scaffold comment.
- Backend (`user-service`): remove `models/Admin.js`, `routes/auth.js`, `scripts/seedAdmin.js`, unmount the router from `app.ts`, remove the `seed:admin` script from `package.json`.
- Backend (`api-gateway`): remove `middleware/verifyJwt.js` and `routes/auth.js`, unmount the router from `app.ts`; isolated since no other route yet depends on the middleware.
