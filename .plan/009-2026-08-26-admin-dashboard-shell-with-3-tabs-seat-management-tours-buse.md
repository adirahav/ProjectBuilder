# Plan 009 — Admin Dashboard Shell with 3 Tabs (Seat Management, Tours & Buses, Passenger Manifest Report)

Status: done
Owner: orchestrator
Last updated: 2026-08-26
Scope-Agents: frontend, tour-service, qa, security

## Goal
Build the Screen 4 "Admin Dashboard" shell described in the PRD: a tabbed layout hosted at `frontend/src/pages/AdminPage.tsx` (currently a placeholder that explicitly defers this work — "The dashboard tabs ... are built by Screen 4's own ticket") with three tabs — **Seat Management**, **Tours & Buses**, **Passenger Manifest Report**. This plan delivers the shell plus a functional, read-oriented first cut of each tab's core view wired to real data, while explicitly deferring heavier mutation flows (manual assign/move/swap modal, full tour/bus/bus-type CRUD forms) to their own follow-up backlog items so this plan stays scoped to "shell + minimum functional content per tab," not the entire Screen 4 feature set in one pass.

## Scope
- In scope:
  - `frontend/src/pages/AdminPage.tsx`: replace the placeholder welcome card with a tabbed shell (tab bar + active-tab content area), keeping the existing `isAdminSession` guard behavior but hardening it into a reusable protected-route pattern (see Open Question 1).
  - `frontend/src/components/admin/`: new tab components —
    - `SeatManagementTab.tsx`: tour/bus selector + live seat map, reusing the existing passenger seat-map rendering logic/component (from Plan 007) in a read/approve-oriented admin context. Quick actions (approve/release/reserve) and the manual assign/move/swap modal are **out of scope** for this plan (separate backlog items per F6–F10) — this tab ships with the seat map visible and status-accurate, with action buttons stubbed/disabled or omitted if the corresponding endpoints don't exist yet.
    - `ToursBusesTab.tsx`: read-only list of tours and their buses (via existing `GET /api/tours` and `GET /api/tours/:tourId/buses`). Create/edit/soft-delete forms and bus-type template management (F11/F12) are **out of scope** for this plan — listed as a follow-up backlog item.
    - `PassengerManifestTab.tsx`: tour/bus selector + table of seats (passenger name, phone, pickup point, status) for the selected bus, with status filter and free-text search (client-side over the fetched dataset), plus a "Copy report" button that formats and copies a shareable summary via `navigator.clipboard`.
  - `frontend/src/components/routing/` (or similar): a small `RequireAdmin` wrapper component that centralizes the "not authenticated as admin" guard currently inlined in `AdminPage.tsx`, so future admin-only pages don't duplicate it. This is a refactor of existing logic, not new auth behavior.
  - `backend/tour-service/`: add one new authenticated admin endpoint to back the Passenger Manifest tab, e.g. `GET /api/buses/:busId/manifest`, returning full seat records (name, phone, pickupPoint, status) for a bus — distinct from the existing public `GET /api/buses/:busId/seats`, which deliberately omits PII (per Plan 008's audit). This endpoint must require a valid admin JWT.
  - `backend/tour-service/`: add JWT verification middleware for admin-only routes if none exists yet (check first — Plan 006 may have already established an admin-login flow but no prior tour-service route required an admin token, so this may be the first consumer).
  - `frontend/src/services/`: `manifest.service.ts` (or extend `seat.service.ts`) to call the new manifest endpoint, and `tour.service.ts`/`bus.service.ts` read calls for the Tours & Buses tab if not already present.
  - `frontend/src/store/slices/`: any new Zustand slice(s) needed for active-tab state and manifest data, per `state-management-layer` conventions (services write store state; components read only).
- Out of scope (explicitly deferred to future backlog items):
  - Seat quick actions (approve/release/reserve) and the manual assign/move/swap modal (F6–F10).
  - Tour/bus/bus-type CRUD forms and bus-type template management (F11/F12).
  - Any new mutation endpoints beyond the one read-only manifest endpoint listed above.
  - `user-management-service` changes — this plan assumes the admin JWT issued by Plan 006's login flow is verifiable by `tour-service` using an existing shared secret/verification approach; if no such mechanism exists, that gap must be resolved as part of "add JWT verification middleware" above using the same secret/algorithm `user-management-service` already signs with (no new user-management-service endpoint needed).

## Assumptions
- `AdminPage.tsx`'s existing `isAdminSession` check (from `frontend/src/store/slices/auth.slice.ts`) is a reliable, server-derived boolean and can continue to gate tab content client-side; true endpoint-level authorization is enforced server-side by the new admin JWT middleware, so the client-side check is UX-only, not a security boundary.
- The existing seat-map rendering component/logic built for Plan 007 (passenger view) is reusable (or easily extracted into a shared component) for the admin Seat Management tab rather than needing a full rewrite.
- `GET /api/tours` and `GET /api/tours/:tourId/buses` are sufficient to populate tour/bus selectors in both the Seat Management and Passenger Manifest tabs without new endpoints.
- No real-time push (websocket) exists yet for seat status; the admin seat map and manifest table are refetch-on-demand/on-tab-focus, consistent with the passenger view's current polling/refetch pattern.

## Open Questions
1. Should the admin guard become a real route-level `<RequireAdmin>` wrapper in `App.tsx`'s route definitions, or stay as an in-page check inside each tab-hosting page (as `AdminPage.tsx` does today, per its explicit "NOT an auth guard" comment)?
- Recommended: introduce `RequireAdmin` as a reusable component wrapping `<AdminPage>`'s route in `App.tsx` now, since this plan already touches `AdminPage.tsx` substantially and a second admin-only page is likely soon (e.g. bus-type template management); centralizing avoids repeating the inline check.
2. Should the Passenger Manifest tab's "Copy report" format be plain text (name / phone / pickup point / status per line, WhatsApp-friendly) or a structured format (CSV/table)?
- Recommended: plain, human-readable text grouped by status (e.g. "TAKEN (12)\n1. Jane Doe - 555-1234 - Main St\n...") since the PRD explicitly calls out WhatsApp/print sharing as the use case, not spreadsheet import.
3. Given seat quick-actions and CRUD forms are deferred, should the Seat Management and Tours & Buses tabs show visible "coming soon" affordances for the deferred actions, or simply omit the buttons entirely for this pass?
- Recommended: omit the buttons entirely rather than showing disabled/placeholder controls, to avoid implying broken functionality; the tabs should read as complete read views for this plan's scope, with actions added cleanly in follow-up plans.

## Steps
1. `frontend/src/components/routing/RequireAdmin.tsx`: extract the existing inline guard logic from `AdminPage.tsx` into this reusable wrapper; update `frontend/src/App.tsx`'s `/admin` route to use it.
2. `frontend/src/pages/AdminPage.tsx`: rebuild as a tab shell — tab bar (Seat Management / Tours & Buses / Passenger Manifest Report) with active-tab state (local state or a small Zustand slice per `state-management-layer` conventions), rendering one of the three new tab components below.
3. `backend/tour-service/`: check for existing JWT verification middleware usable for admin routes; if absent, add it (reusing `user-management-service`'s signing secret/algorithm — no new service, just verification on the `tour-service` side) and apply it only to the new manifest route in Step 4.
4. `backend/tour-service/api/bus/`: add `GET /api/buses/:busId/manifest` (admin-only) returning full seat records with PII (name, phone, pickupPoint, status) for the given bus; add tests covering 200 (admin token), 401/403 (missing/invalid token), and empty-bus (no seats) cases.
5. `frontend/src/services/manifest.service.ts`: add a typed client for the new endpoint; extend `frontend/src/store/slices/` with whatever state is needed to hold the current manifest rows.
6. `frontend/src/components/admin/SeatManagementTab.tsx`: tour/bus selector + reused seat-map rendering (extract shared seat-map component from Plan 007's passenger view if not already component-ized) in read/status-display mode.
7. `frontend/src/components/admin/ToursBusesTab.tsx`: tour/bus selector-free list view — tours with their buses nested/expandable, read-only, using existing `GET /api/tours` and `GET /api/tours/:tourId/buses`.
8. `frontend/src/components/admin/PassengerManifestTab.tsx`: tour/bus selector, manifest table (name, phone, pickup point, status), status filter, free-text search (client-side filter over fetched rows), and "Copy report" button using `navigator.clipboard.writeText` with the format decided in Open Question 2.
9. Style all new components per `.rule/style-rules.md` (Tailwind-only, existing color/status mapping for seat status) and accessibility per the `accessibility-layer` skill (status conveyed by icon + text label, not color alone — same rule as Screen 3).
10. Add/extend tests: `frontend` component tests for the three tabs and `RequireAdmin`, `backend/tour-service` route/controller tests for the new manifest endpoint (including the PII-exposure-is-intentional-here-but-admin-gated assertion, contrasting with Plan 008's public-endpoint PII exclusion).

## Validation
- `frontend` test suite passes, including new tests for `AdminPage.tsx` tab switching, `RequireAdmin`, and each of the three tab components (rendering, data fetch, empty/error states).
- `backend/tour-service` test suite passes, including new tests for `GET /api/buses/:busId/manifest`: 200 with correct PII fields for a valid admin token, 401/403 for missing/invalid/non-admin token, correct filtering/shape of returned rows.
- Manual/QA check: logging in as admin (Screen 1 modal) and navigating to `/admin` shows the 3-tab shell; switching tabs preserves the admin session and loads each tab's data without a full page reload.
- Manual/QA check: Passenger Manifest tab's status filter and free-text search correctly narrow the visible rows, and "Copy report" places a readable summary on the clipboard matching the format from Open Question 2.
- Manual/QA check: an unauthenticated request to `GET /api/buses/:busId/manifest` (no/invalid token) is rejected; the public `GET /api/buses/:busId/seats` endpoint still returns no PII (regression check against Plan 008).
- `qa` agent confirms the above end-to-end across both frontend and backend.
- `security` agent confirms the new admin JWT verification on the manifest endpoint is correctly enforced (rejects missing/invalid/expired/non-admin tokens), that PII (name/phone) is only ever returned from this admin-gated route and never leaks into any public/passenger-facing response, and that the `RequireAdmin` client-side guard is not relied upon as the actual security boundary.

## Risks
- PII exposure risk: the new manifest endpoint is the first tour-service route to intentionally return passenger PII; a misconfigured or missing admin-auth check would leak all passengers' names/phones for a bus — mitigated by dedicated JWT middleware, explicit tests for unauthorized access, and `security` agent review (hence `security` and `tour-service` are both in Scope-Agents).
- Auth-integration risk: if `tour-service` has no existing mechanism to verify JWTs issued by `user-management-service` (different service, potentially different secret/config source), Step 3 could uncover a larger cross-service auth gap than expected — flagged as a risk to surface early rather than assumed away.
- Scope-creep risk: the PRD describes much more per-tab functionality (seat quick actions, full CRUD, manual assign/move/swap) than this "shell" plan delivers; without the explicit Out-of-scope list and follow-up-backlog framing, this could either balloon the plan or leave the backlog item's own definition of "done" ambiguous — mitigated by naming the deferred items explicitly so they can be tracked as separate backlog entries.
- Reuse risk: if Plan 007's seat-map rendering isn't already a standalone, reusable component, Step 6 may require a refactor/extraction with a larger surface area than anticipated — kept minimal by extracting only the rendering logic, not changing passenger-view behavior.

## Rollout Order
1. `RequireAdmin` extraction and route wiring (Step 1).
2. Backend: admin JWT middleware + manifest endpoint + tests (Steps 3–4).
3. Frontend: tab shell in `AdminPage.tsx` (Step 2) and services/store wiring (Step 5).
4. Frontend: three tab components in parallel-friendly order — Seat Management, Tours & Buses, Passenger Manifest (Steps 6–8).
5. Styling/accessibility pass (Step 9).
6. Test additions across frontend and tour-service (Step 10).
7. QA end-to-end pass, then security review of the new admin-authenticated endpoint and PII handling.

## Rollback
All new code is additive (new components, one new backend route, a route-wrapper refactor). Rollback means: revert the `AdminPage.tsx` tab-shell commit(s) back to the prior placeholder, remove the new `GET /api/buses/:busId/manifest` route and its middleware if added standalone, and remove the new frontend tab components/services/slices — no destructive data-model or existing-endpoint changes are made, so rollback carries no data-migration risk.
