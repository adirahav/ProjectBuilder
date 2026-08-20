# Plan 012 — Admin Dashboard: Services management (create/edit/deactivate)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-19
- Scope-Agents: frontend, booking-service, api-gateway, qa, security

## Goal
Implement Screen 6 (Admin Dashboard: Services) per the PRD: an authenticated Admin page listing all `Service` records (including inactive ones) with create, edit, and deactivate (soft-delete) actions — F6 (`POST /api/services`), F7 (`PATCH /api/services/:id`), F8 (`PATCH /api/services/:id/deactivate`), all served by `booking-service` via `api-gateway` and gated by the `verifyJwt` middleware that plan 011 built and left unused.

## Scope
- In scope (`backend/booking-service/api/service/`): `listAllServices()` (no `isActive` filter, unlike the existing public `listActiveServices()`), `createService(input)`, `updateService(id, patch)`, `deactivateService(id)` in `service.service.ts`; corresponding controller handlers in `service.controller.ts`; new routes in `service.routes.ts` — `GET /api/services/all`, `POST /api/services`, `PATCH /api/services/:id`, `PATCH /api/services/:id/deactivate` — mounted as a second, admin-only router (or additional routes on the existing `serviceRouter`, see Open Questions) distinct from the existing public `GET /api/services`.
- In scope (`backend/api-gateway/api/`): a `service-proxy` module (route + controller + service, mirroring the existing `auth-proxy` pattern) that forwards the four admin routes above to `booking-service`, mounted behind `verifyJwt` in `app.ts`; the existing unauthenticated `GET /api/services` proxy is out of scope (not yet proxied per plan 007/011 notes) unless required to unblock this task (see Open Questions).
- In scope (`frontend/src/`): `services/services.service.ts` additions — `getAllServices()`, `createService()`, `updateService()`, `deactivateService()` calling `api-gateway`'s admin routes with the stored JWT attached (existing `http.service.ts` interceptor from plan 011); an `AdminServicesPage` (list of all services with name/duration/price/active-status, each row showing status via label/icon per `accessibility-layer` since v1 already avoids color-only meaning); a create/edit form (modal or inline) with fields name, duration, price, active toggle, client-side validation; a "Deactivate" action per active row with a confirmation step (irreversible-feeling action, though it is a soft delete); wiring `/admin/services` as a new route behind the existing `ProtectedRoute`, replacing or extending the current `/admin` placeholder from plan 011.
- Out of scope: Admin Dashboard: Appointments (Screen 7, F9–F11), re-activating a deactivated service (PRD only specifies deactivate; no "reactivate" requirement — flagged in Open Questions), service deletion (hard delete — explicitly excluded by the PRD's soft-delete rule), any change to the existing public `GET /api/services` route or its `isActive: true` filtering behavior, `notification-service` and `user-service` (no changes needed).
- Repo-relative scope: frontend changes under `frontend/src/`; backend changes under `backend/booking-service/api/service/` and `backend/booking-service/api/app.ts`; gateway changes under `backend/api-gateway/api/` (new `service-proxy/` module + `app.ts` wiring). No changes to `backend/user-service/` or `backend/notification-service/`.

## Assumptions
- `verifyJwt` middleware and the `auth-proxy` pattern already exist in `api-gateway` (plan 011) and are directly reusable as the template for this task's `service-proxy` module.
- `Service` Mongoose model (`backend/booking-service/api/models/service.model.ts`) already has `name`, `durationMinutes`, `price`, `isActive`, `uuid` — no schema migration is needed; this task only adds write operations against the existing schema.
- `ProtectedRoute` and the auth Zustand store (plan 011) exist and are reused unchanged; this task only adds a new guarded route and page.
- The frontend's `/admin` placeholder route (plan 011) is meant to be replaced/extended by real Admin screens as they land — this task is the first to do so.
- `booking-service` writes should stay in the same `service/` module (extending `service.service.ts`/`service.controller.ts`/`service.routes.ts`) rather than a parallel "admin-service" module, to keep one source of truth for the `Service` resource.

## Open Questions
1. Should the admin "list all services" endpoint be a new path (`GET /api/services/all`) or should the existing `GET /api/services` accept an admin-only query/header to include inactive services?
   - Recommended: a new path, `GET /api/services/all`, kept behind `verifyJwt` — reusing the same public path with conditional behavior risks accidentally leaking inactive services if the auth check is ever bypassed or misconfigured; a separate path makes the admin-only nature explicit in routing, not just in a branch of logic.
2. Should `api-gateway` also add a proxy for the existing public `GET /api/services`, since this task is the first to build a `service-proxy` module at all?
   - Recommended: no — the public route is explicitly out of scope per plans 007/011 (frontend calls `booking-service` directly for public routes), and adding it here would silently expand scope beyond F6-F8; the new `service-proxy` module only proxies the four admin-only routes.
3. Should deactivation support reactivation (`isActive: false` -> `true`) even though the PRD only specifies "deactivate"?
   - Recommended: no dedicated reactivate endpoint now — implement `PATCH /api/services/:id` (F7, general edit) to also be capable of setting `isActive: true`, so an admin can reverse a deactivation via the same edit form without a new route; this satisfies "undo" without inventing an unrequested feature.
4. Should deleting/deactivating a service affect existing/future `TimeSlot`s or `Appointment`s tied to it (e.g. does deactivating hide it only from Screen 1, or also block new time-slot generation)?
   - Recommended: deactivation only flips `Service.isActive` and hides it from the public `GET /api/services` list (already the case); it does not touch existing `TimeSlot`/`Appointment` records, consistent with the PRD's description of deactivation as a Screen-1 visibility change, not a cascading write — worth a `security`/data-integrity sanity check since it's the first write path touching a resource other screens read.
5. Should create/edit use a modal dialog or a separate inline/route-based form?
   - Recommended: a modal dialog over the list — keeps the admin on one page for a low-cardinality resource (a small clinic's service list), avoids adding new routes/navigation state for a simple CRUD form, and is easier to make keyboard-accessible with a well-scoped focus trap.

## Steps
1. `backend/booking-service/api/service/service.service.ts` — add `listAllServices()` (same shape as `listActiveServices()` but no `isActive` filter, sorted `createdAt: -1`), `createService(input: { name, durationMinutes, price })` (validates and inserts, `isActive` defaults `true`), `updateService(id, patch: Partial<{ name, durationMinutes, price, isActive }>)` (looks up by `uuid`, applies only provided fields, 404 if not found), `deactivateService(id)` (sets `isActive: false`, thin wrapper over `updateService`).
2. `backend/booking-service/api/service/service.controller.ts` — add `getAllServices`, `postService`, `patchService`, `patchDeactivateService` handlers: request validation (name required non-empty string, `durationMinutes`/`price` required positive numbers on create; on edit, only validate fields that are present), uniform error envelope (`400` invalid body, `404` not found, `503` DB not connected, `500` unexpected), mirroring `getServices`'s existing error-handling style.
3. `backend/booking-service/api/service/service.routes.ts` — add `GET /all`, `POST /`, `PATCH /:id`, `PATCH /:id/deactivate` to `serviceRouter`. No auth check here — `booking-service` trusts `api-gateway` to have already verified the JWT (per the existing `x-internal-admin` header pattern from plan 011's `verifyJwt`).
4. `backend/api-gateway/api/service-proxy/service-proxy.service.ts`, `service-proxy.controller.ts`, `service-proxy.routes.ts` — new module mirroring `auth-proxy`'s shape: forwards `GET /all`, `POST /`, `PATCH /:id`, `PATCH /:id/deactivate` to `booking-service`, relaying status/body.
5. `backend/api-gateway/api/app.ts` — mount `/api/services` behind `verifyJwt` for the four admin routes, e.g. `app.use('/api/services', verifyJwt, serviceProxyRouter)`; confirm this does not collide with or accidentally gate the separate public `GET /api/services` call the frontend makes directly to `booking-service` (no gateway route for that path exists or is added here, per Open Question 2).
6. `frontend/src/services/services.service.ts` (or wherever `getServices()` from plan 007 lives) — add `getAllServices()`, `createService(input)`, `updateService(id, patch)`, `deactivateService(id)`, all calling `api-gateway` (not `booking-service` directly) via the shared `http.service.ts` client so the stored JWT is attached automatically.
7. `frontend/src/pages/AdminServicesPage.tsx` — page component: fetches `getAllServices()` on mount, renders a table/list of all services (name, duration, price, active status shown with label + icon, not color-only), a "Create service" action opening the create form, per-row "Edit" and "Deactivate" (only shown/enabled for active rows) actions.
8. `frontend/src/components/ServiceForm.tsx` (modal, per Open Question 5) — shared create/edit form: name, duration (minutes), price, active toggle; client-side validation (required name, positive numeric duration/price); submit calls `createService` or `updateService` depending on mode; accessible modal (focus trap, `Escape` to close, labelled fields) per `accessibility-layer`.
9. `frontend/src/App.tsx` — add `/admin/services` route wrapped in the existing `ProtectedRoute`, rendering `AdminServicesPage`; update the `/admin` placeholder to link/redirect to it (or become an Admin nav shell if that's cheaper — implementer's judgment, no new screen beyond Services is in scope here).
10. Manual verification: log in as Admin (plan 011 flow), view the Services list (including a seeded inactive service), create a new service and confirm it appears, edit it and confirm changes persist, deactivate it and confirm it disappears from the public Screen 1 (`GET /api/services`) while remaining visible in the Admin list with an inactive label.

## Validation
- `GET /api/services/all` (via `api-gateway`, with a valid Admin JWT) returns all services including inactive ones; without a token or with an invalid/expired token it returns `401`.
- `POST /api/services` with valid body returns `201`/`200` and the created service (`isActive: true` by default); with missing/invalid `name`/`durationMinutes`/`price` returns `400`.
- `PATCH /api/services/:id` updates only the provided fields and returns the updated document; an unknown `:id` returns `404`.
- `PATCH /api/services/:id/deactivate` sets `isActive: false`; the service then no longer appears in the existing public `GET /api/services`, but still appears in `GET /api/services/all`.
- All four admin routes reject requests without a valid `Authorization: Bearer <token>` with `401`, proving they are actually gated by `verifyJwt` and not accidentally left open.
- Frontend: `AdminServicesPage` lists all services (active and inactive) with an accessible, non-color-only active/inactive indicator; creating, editing, and deactivating a service through the UI reflects immediately in the list; the create/edit form rejects invalid input inline before submission.
- Keyboard-only navigation can open the create/edit modal, fill every field, and submit; the modal traps focus and is dismissible via `Escape`.
- No changes leak into `backend/user-service/` or `backend/notification-service/`; the existing public `GET /api/services` behavior (active-only, unauthenticated) is unchanged.

## Risks
- **New Admin write surface on a shared resource**: `Service` is read by the public, unauthenticated Screen 1 as well as by the admin routes added here — a bug in `updateService`/`deactivateService` (e.g. a missing field guard) could corrupt data the public flow depends on. Mitigated by reusing the existing `Service` model unchanged and only ever patching explicitly-provided fields. `security` is included in Scope-Agents to review the new write routes, the `verifyJwt` gating, and that `booking-service`'s new routes correctly trust only gateway-forwarded requests.
- **First real use of `verifyJwt` and the gateway-proxy pattern for a non-auth route**: plan 011 built and exported `verifyJwt` and the `auth-proxy` module but nothing else used them yet; this task is the first proof that the pattern generalizes to a second resource. `api-gateway` is included in Scope-Agents because this task adds real proxy code and route-gating to it, not merely references it.
- **`booking-service` currently has no admin-facing auth of its own** (it trusts the gateway's `x-internal-admin` header per plan 011's note): if `booking-service`'s new routes are ever reachable directly (bypassing the gateway, e.g. in a misconfigured deployment), they would be unauthenticated writes. Flagged for `security` review; mitigated in this task only by documenting the trust boundary, not by adding a second auth check in `booking-service` (out of scope, would duplicate the gateway's job).
- **Soft-delete/reactivation ambiguity** (Open Question 3): if `PATCH /api/services/:id` isn't implemented to allow `isActive: true`, admins have no way to undo a deactivation without direct DB access — mitigated by explicitly including that in Step 1/2's field list.
- No `user-service` or `notification-service` code is touched, so they are correctly excluded from Scope-Agents.

## Rollout Order
1. `booking-service`: service-layer + controller + route additions (Steps 1–3), verified via direct HTTP calls against a running instance.
2. `api-gateway`: `service-proxy` module + `verifyJwt`-gated mount (Steps 4–5), verified via direct HTTP calls through the gateway with and without a valid token.
3. Frontend: API client additions (Step 6).
4. Frontend: `AdminServicesPage` + `ServiceForm` + router wiring (Steps 7–9).
5. End-to-end manual verification against all three running pieces (Step 10 / Validation).

## Rollback
- Frontend: remove `frontend/src/pages/AdminServicesPage.tsx` and `frontend/src/components/ServiceForm.tsx`, revert the `services.service.ts` additions, revert `App.tsx`'s `/admin/services` route addition.
- `api-gateway`: remove `backend/api-gateway/api/service-proxy/`, unmount it from `app.ts`; isolated from `auth-proxy`, which is unaffected.
- `booking-service`: revert the added handlers/routes in `service.service.ts`/`service.controller.ts`/`service.routes.ts`, leaving the existing public `GET /api/services` (Steps from plan 007) untouched.
