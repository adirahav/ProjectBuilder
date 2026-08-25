# Plan 006 — Gateway (Login) Screen: Passenger vs Admin Entry, Admin Login Modal

Status: done
Owner: orchestrator
Last updated: 2026-08-25
Scope-Agents: frontend, user-management-service, qa, security

## Goal
Implement Screen 1 (Gateway) from the PRD: a landing page offering a choice between "Continue as passenger" (proceeds directly to Screen 3, no auth) and "Admin login" (opens a modal with username/password, submitting to `POST /api/auth/login` and storing the returned JWT on success), with inline error display on invalid credentials and no page navigation on failure.

## Scope
- In scope:
  - `frontend/`: new Gateway page/route (likely `/` or `/gateway`) with two entry actions — passenger CTA that navigates to the tour/bus selection route (Screen 3), and an "Admin login" button that opens a modal.
  - `frontend/`: Admin login modal component — username, password fields, submit button, inline error state on failure, loading state during submit, closes and redirects to the admin dashboard route (Screen 4) on success.
  - `frontend/`: Zustand auth slice (or extension of an existing one) to store JWT + admin session state after successful login, per `state-management-layer` skill.
  - `frontend/`: API call to `POST /api/auth/login` via the `api-layer` skill conventions.
  - `backend/user-management-service/`: `POST /api/auth/login` route/controller/service — validates username/password against stored admin credentials, returns JWT on success, returns a clear 401/invalid-credentials error otherwise (F1).
  - Minimal link from Gateway to the existing `/signup` page (plan 005) if appropriate for discoverability — not a primary requirement of this screen but a small wiring nicety.
- Out of scope:
  - Admin Signup page itself (already covered by plan 005).
  - Passenger view / seat map (Screen 3) and Admin Dashboard (Screen 4) implementations — this plan only wires navigation targets/routes to them, not their internal content.
  - Role-promotion endpoint (F2b).
  - Any protected-route/auth-guard middleware for Screen 4 beyond storing the JWT (full route-guarding may be a follow-up if not already covered elsewhere).

## Assumptions
- `frontend/` (Vite + React + TS + Tailwind v4 + Zustand, plan 001) and `backend/user-management-service/` (Express + Mongoose, plan 003) are scaffolded and dependencies installed (plan 004).
- A `User` model with `roles: string[]` already exists or is being established by plan 005; login authenticates against that same collection, checking `roles` includes `admin` where relevant (see Open Questions).
- No design mockups exist for this screen (PRD: "No external design source is provided... Design the UI yourself per `.rule/style-rules.md`"), so the frontend agent designs the Gateway page and modal within `.rule/style-rules.md` and the `css-layer`/`ui-component-layer`/`accessibility-layer` skill conventions.
- JWT signing/secret infrastructure either already exists in `user-management-service` (e.g., stubbed while building plan 005's signup) or is implemented here consistently with the `jwt-middleware-layer` skill, since login is the first place a JWT is definitely required end-to-end.

## Open Questions
1. Does `POST /api/auth/login` accept any valid user credentials (any `roles`), or must the account have `roles` including `admin` to succeed, given this modal is explicitly the "Admin login" entry point?
- Recommended: restrict success to accounts with `roles` including `admin` — a non-admin user attempting "Admin login" should get the same inline "invalid credentials" error (not a distinct message, to avoid leaking which accounts exist), since a plain passenger has no login step per the PRD and this modal's only purpose is admin auth.

2. Where does "Continue as passenger" navigate to, given Screen 3 (tour/bus selection) doesn't exist as a route yet?
- Recommended: route to `/tours` (or equivalent placeholder route) now; if Screen 3 isn't built yet, add a minimal placeholder page so the navigation doesn't 404, to be filled in by that screen's own plan.

3. Should the login field accept "username" (per PRD wording) or "email" (since plan 005's signup collects email, not a separate username field)?
- Recommended: treat the login field as "email" functionally but label/accept it as identifying the account (reusing the existing `email` field from the `User` model), since the PRD's "username" wording likely refers informally to the login identifier and introducing a separate `username` field would require a model change not otherwise motivated.

4. After successful admin login, does the app auto-redirect to the Admin Dashboard (Screen 4), which is not yet built?
- Recommended: redirect to `/admin` now; if Screen 4 isn't built yet, add a minimal placeholder/stub page so the redirect doesn't 404, to be replaced by that screen's own plan.

## Steps
1. `backend/user-management-service/`: implement `POST /api/auth/login` — validate body, look up user by email, verify password hash, check `roles` includes `admin` (per Open Question 1 resolution), return JWT + minimal user info on success, return a generic invalid-credentials error (401) otherwise, per `service-layer`/`jwt-middleware-layer`/`backend-service-layer` skills.
2. `backend/user-management-service/`: add unit/integration tests for the login route (valid admin, wrong password, unknown email, valid non-admin user rejected).
3. `frontend/`: build the Gateway page component with two entry actions (passenger CTA, admin login trigger), styled per `css-layer`/`ui-component-layer` conventions.
4. `frontend/`: build the Admin Login modal — username/email + password fields, submit handler calling the login API via `api-layer` conventions, inline error message on failure (no navigation), loading/disabled state while submitting, per `accessibility-layer` skill (labeled inputs, focus trap, `aria` error announcements, keyboard-dismissible).
5. `frontend/`: add/extend a Zustand auth slice to persist JWT + admin flag on success, per `state-management-layer` skill.
6. `frontend/`: wire routing — Gateway at `/`, passenger CTA to `/tours` (add placeholder if Screen 3 not yet built), successful admin login redirect to `/admin` (add placeholder if Screen 4 not yet built), per Open Questions 2 and 4.
7. `frontend/`: add minimal link from Gateway to `/signup` (plan 005) for discoverability.
8. Cross-service: confirm frontend's expected login response shape (JWT, user/roles info, error format) matches backend's actual implementation before marking done.

## Validation
- `POST /api/auth/login` with valid admin credentials returns a JWT and 200.
- `POST /api/auth/login` with wrong password, unknown email, or a valid non-admin account all return the same generic invalid-credentials error (401), confirmed via backend tests.
- Frontend modal shows the inline error on failed login without navigating away or closing the modal; form remains editable for retry.
- Successful login closes the modal, stores the JWT/session in Zustand, and redirects to the admin route.
- "Continue as passenger" navigates directly to the tour/bus route with no auth step or modal shown.
- Modal is keyboard-accessible (focus trapped while open, `Escape` closes it, labeled fields, error announced via `aria-live` or similar) — reviewed against `accessibility-layer` skill.
- `qa` agent runs through both entry paths end-to-end (passenger navigation, admin login success and failure cases).
- `security` agent reviews credential handling (no plaintext logging, generic error messages that don't leak account existence, JWT storage location/expiry, and confirms non-admin accounts cannot obtain a JWT via this specific endpoint if Open Question 1 is resolved as recommended).

## Risks
- Auth/PII risk: login handles passwords and issues JWTs; incorrect error messaging could leak which emails are registered — mitigated by using a single generic error message for all failure modes (Validation, Step 1).
- Privilege risk: if the login endpoint doesn't check `roles` includes `admin`, any regular signed-up user (from plan 005) could obtain a JWT through the "Admin login" modal and potentially reach admin-only routes/actions — mitigated by the role check in Step 1 and covered by `security` review.
- Client-side JWT storage risk: where the JWT is stored (memory vs localStorage) affects XSS exposure; `security` review should confirm the chosen approach is reasonable for this stage of the project.
- Placeholder-route risk: since Screens 3 and 4 aren't built yet, this plan's navigation targets may need rework once those screens' own plans land — flagged explicitly in Steps 6 rather than silently assumed.

## Rollout Order
1. Backend `POST /api/auth/login` route + tests (Steps 1–2).
2. Frontend Gateway page + Admin login modal + accessibility (Steps 3–4).
3. Frontend auth state wiring (Step 5).
4. Frontend routing incl. placeholders (Steps 6–7).
5. Cross-service contract confirmation (Step 8).
6. QA end-to-end validation, then security review.

## Rollback
Remove the Gateway route/page, Admin login modal component, and any placeholder `/tours`/`/admin` routes added solely for this plan; remove `POST /api/auth/login` route/controller/tests from `backend/user-management-service/`; revert the Zustand auth slice changes if not yet relied upon by other completed work.
