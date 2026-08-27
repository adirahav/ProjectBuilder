=== SECURITY AGENT REPORT ===

Ticket: ADMINDAS-SEC
Date: 2026-08-26

## Summary
CRITICAL: 1   HIGH: 0   MEDIUM: 1   LOW: 2   PASS: 27

The frontend half of this ticket (RequireAdmin/AdminRoute guard, the three tab
components, `manifest.service.ts`, `http.service.ts` token handling) is
implemented carefully and defensively — it correctly treats the client-side
admin check as UX-only, attaches the token only through the central HTTP
layer, and never logs PII. The blocking issue is on the backend: the one
security-critical deliverable this plan assigned to `tour-service` —
`GET /api/buses/:busId/manifest`, the admin-gated PII endpoint — **was never
implemented**. Both `docs/agent-reports/2026-08-26-ADMINDAS-TOUR-...md` and
the `-USER-...md` counterpart report `STATUS: DONE (skipped — out of scope)`,
which contradicts plan 009's explicit Step 3/4 and its Scope-Agents list
(`tour-service`, `security`). Nothing built on top of the missing endpoint can
be verified as secure — including the exact plan 009 Validation bullet this
agent was asked to confirm ("the new admin JWT verification on the manifest
endpoint is correctly enforced").

## Findings

### [SEV-001] CRITICAL — Admin-gated PII endpoint required by this ticket does not exist
Location: `backend/tour-service/api/bus/bus.routes.ts:1-9` (only mounts `GET /:busId/seats`); `backend/tour-service/api/app.ts:24-26` (no `/manifest` route mounted anywhere)
Issue: Plan 009 Steps 3-4 require `tour-service` to add admin JWT middleware usage plus `GET /api/buses/:busId/manifest`, returning passenger PII (name/phone/pickup point) gated behind `requireAdmin`. The API contract (`docs/api-contract/api-contract.tour-service.yaml:257` onward) fully documents this route, its 200/401/403 responses, and its PII shape. Neither the route, its controller, nor its service method exist in `backend/tour-service/api/bus/`. The `requireAdmin` middleware (`api/lib/auth.middleware.ts`) and `verifyToken` (`api/lib/jwt.ts`) are correctly written and unit-tested in isolation by this agent's new test suite, but **no route in the codebase calls `requireAdmin`** — it is dead code today.
Expected: `GET /api/buses/:busId/manifest` exists, is mounted with `requireAdmin`, returns 401 with no token, 403 for a `role: user` token, and 200 with the seat/passenger rows for a valid admin token — matching the contract.
Actual: The route returns a bare 404 for every case (proven by `docs/tests/security/admindas-sec.security.test.ts`, describe block `ADMINDAS-SEC (known gap, tracked as SEV-001)` — those three cases are written with `it.fails` specifically so they read as passing today, documenting the gap, and will start reporting a failure the moment someone implements the endpoint, which is the signal to flip them back to plain `it`).
Fix: `tour-service` must implement the endpoint per the contract: a `bus.controller.ts` handler + `bus.service.ts` method that returns each seat's `label`, `status`, `passengerName`, `passengerPhone`, `pickupPointName` for the bus, mounted as `busRouter.get('/:busId/manifest', requireAdmin, busController.getManifest)`. This is a re-trigger of the `tour-service` backend agent, not a fix this agent can make (write access is restricted to `docs/tests/security/` and `docs/agent-reports/`).
Consequence if shipped as-is: the Passenger Manifest tab is entirely non-functional (every request 404s) and, more importantly for future risk, the frontend, store, and types layer are all already wired and waiting for a PII-carrying response — the day someone adds *any* route matching this path without re-running this audit, there is no established test/contract-compliance gate that would have caught a missing or misapplied `requireAdmin`.

### [SEV-002] MEDIUM — `JWT_SECRET` does not fail fast at startup if unset
Location: `backend/tour-service/api/lib/config.ts:34` (`jwtSecret: process.env.JWT_SECRET ?? ''`, contrast with `mongodbUri`/`frontendOrigin` on lines 30/36 which both use the fail-fast `required()` helper)
Issue: Every other cross-service-sensitive config value uses `required()`, which throws at process startup if the env var is missing or empty. `jwtSecret` silently defaults to `''` instead.
Expected: A missing `JWT_SECRET` should prevent the service from starting, the same as a missing `MONGODB_URI` or `FRONTEND_ORIGIN` — a silent empty secret in production is exactly the shared-secret-drift scenario this project's Scope section calls a HIGH-minimum risk category.
Actual: The service starts normally with `config.jwtSecret === ''`. `verifyToken` (`api/lib/jwt.ts:22-23`) does have an explicit `if (!config.jwtSecret) throw` guard, and `requireAdmin` catches that throw and returns 401 — so today this fails *closed*, not open, and is not itself exploitable. It is a defense-in-depth gap: the failure is only caught because a second, independent guard happens to exist, not because misconfiguration is rejected at the boundary where it occurs.
Fix: Change `jwtSecret: process.env.JWT_SECRET ?? ''` to `jwtSecret: required('JWT_SECRET')` in `config.ts`, matching the other two required values.

### [SEV-003] LOW — Dev-tooling dependency vulnerabilities (non-production surface)
Location: `backend/tour-service/package.json` devDependencies (`vite`/`vitest`/`esbuild` chain)
Issue: `npm --prefix backend/tour-service audit --audit-level=high` reports 1 critical + 1 high (both `esbuild <=0.24.2`, "enables any website to send any requests to the development server and read the response," pulled in transitively via `vite`→`vitest`→`@vitest/mocker`/`vite-node`).
Expected: Zero high/critical per the audit gate.
Actual: 1 critical, 1 high, both scoped to the local Vite dev server used only for running tests — not present in the production Express server (`api/app.ts`/`api/server.ts` have no Vite dependency). Pre-existing (flagged as LOW/non-blocking in the prior SEATREQU-SEC report too), not introduced by this ticket.
Fix: `npm audit fix --force` inside `backend/tour-service` would upgrade to `vitest@4.1.11` (a breaking major-version change) — track as a separate maintenance ticket rather than blocking this feature on a test-tooling-only exposure.

### [SEV-004] LOW — `tour-service` report for this ticket is internally inconsistent with the plan
Location: `docs/agent-reports/2026-08-26-ADMINDAS-TOUR-admin-dashboard-shell-with-3-tabs-seat-management-tours-buse-tour-service.md`
Issue: The report says `STATUS: DONE (skipped — out of scope for this task, per backlog "scope:" field)`. Plan 009 explicitly lists `tour-service` in `Scope-Agents` and dedicates Steps 3-4 and a full Risk paragraph to exactly this endpoint. (The equivalent `-USER-...md` report making the same claim for `user-management-service` is correct — that service is genuinely out of scope per the plan's own text.)
Expected: The `tour-service` report should either implement Steps 3-4 or explicitly flag the scope disagreement back to the orchestrator instead of self-certifying DONE.
Fix: Process fix, not code — re-run/re-trigger the `tour-service` backend agent against plan 009's actual scope text.

## Checklist Results

### Backend (`tour-service`)
- [x] JWT secret read from env var, never hardcoded — PASS (`config.ts:34`, though see SEV-002 for the missing `required()` fail-fast)
- [x] JWT expiry set and enforced — PASS (`jwtExpiresIn` used at sign time by whichever service issues tokens; `jwt.verify` enforces `exp` by default; expired-token test passes)
- [x] Algorithm allowlist pinned (`algorithms: ['HS256']`), `alg: none` rejected — PASS (proven by test: hand-built `alg: none` token → 401)
- [x] Tokens validated (signature + expiry) independently, no cross-service callback — PASS by inspection (`jwt.ts` calls `jwt.verify` directly against the local `config.jwtSecret`)
- [~] Cross-service JWT secret/algorithm identity (`tour-service` vs `user-management-service`) — **UNVERIFIABLE**: `backend/user-management-service` does not exist in this repository (only `backend/.env.shared.example` and the shared-secret convention it documents). Cannot be a drift finding against a service that hasn't been built yet; flagged as unverifiable, not PASS.
- [x] Public passenger flow is intentionally public, nothing else accidentally public — PASS: only `POST /api/seats/bookings`, `GET /api/tours`, `GET /api/tours/:tourId/buses`, `GET /api/buses/:busId/seats` are mounted, all deliberately public per PRD/prior audits.
- [x] `seat.status` never accepted as an arbitrary client string — PASS (`ALLOWED_BOOKING_FIELDS` whitelist rejects unknown `status` field with 400; test confirms)
- [x] Contested seat transitions use atomic conditional update, not read-then-write — PASS by inspection (`seat.service.ts:139-151`, single `findOneAndUpdate({ _id, status: 'available' }, ...)`)
- [x] Concurrency: two simultaneous bookings for the same seat → exactly one 201, one 409 — PASS (new concurrency test + pre-existing `seatBooking.test.ts` 10-way race test both green)
- [ ] Admin-only override actions (approve/cancel/toggle-reserve/manual-assign/swap-move) — N/A, explicitly out of scope for this plan (F6-F10, not yet built)
- [x] CORS restricted to configured frontend origin, not `*` — PASS (`app.ts:21`, `cors({ origin: config.frontendOrigin })`; test confirms the configured origin is reflected and an arbitrary origin is not)
- [x] No secrets hardcoded in source — PASS, grep-clean
- [x] `.env` files excluded from git except `.example` — PASS (`.gitignore:27-34,52-54`)
- [x] Soft-deleted `tour`/`bus` excluded from list/get — PASS (`Tour.model.ts`/`Bus.model.ts` `pre('find'|'findOne'|'countDocuments', excludeDeleted)` hooks; new tests confirm a soft-deleted tour/bus is excluded from `GET /api/tours` / `GET /api/tours/:tourId/buses`)
- [x] `busType`/`seat` never soft-deleted — PASS by inspection (no `deletedAt` field on `Seat.model.ts`; no `busType` model exists yet in this codebase)
- [ ] **`GET /api/buses/:busId/manifest` admin-gated, PII correctly scoped** — **FAIL, see SEV-001.** This is the ticket's core backend deliverable and it does not exist.
- [x] Password hashes / `admin` records — N/A, no admin CRUD or password storage touched by this plan; `user-management-service` (which would own that) is correctly out of scope

### Frontend
- [x] Auth token attached only via `http.service.ts` — PASS (`manifest.service.ts` goes through `httpService.get(..., { withAuth: true })`; no ad-hoc fetch found in `components/admin/`)
- [x] Token persisted via the existing storage abstraction, not duplicated — PASS by inspection (`http.service.ts` calls `getAuthToken()`/`clearAuthToken()` from `util.service.ts`; no new storage code introduced by this ticket)
- [x] Token cleared on 401 / logout — PASS (`http.service.ts:140-143`, `handleSessionExpiry()`)
- [x] Token never logged — PASS, grep-clean across `components/admin/`, `services/manifest.service.ts`, `services/http.service.ts`
- [x] No token/secret in URLs — PASS, `manifest.service.ts` puts `busId` (not a secret) in the path, token only in the `Authorization` header
- [x] No `dangerouslySetInnerHTML`, `eval`, or `Function` with external data in the new admin components — PASS, grep-clean
- [x] User-supplied strings (passenger name/phone/pickup) rendered via plain JSX text nodes, not raw HTML — PASS (`PassengerManifestTab.tsx:246-260`)
- [x] No PII in `console.log` — PASS: every `console.log` call added by this ticket (`PassengerManifestTab.tsx`, `SeatManagementTab.tsx`, `ToursBusesTab.tsx`) logs only `busId`/`tourId`/row counts/error objects, never `fullName`/`phone`/`pickupPoint`
- [x] Frontend never trusts a client-computed seat status — PASS: `SeatManagementTab.tsx` renders only `seatMap` from the store, written solely by `seatService` from the server response; no local status mutation exists in the admin tabs
- [x] API base URLs from env vars, not hardcoded — PASS (`http.service.ts:54-57,66-74`, throws if the env var is missing rather than silently falling back to a hardcoded URL)
- [x] Raw API errors never surfaced to the user — PASS: both tabs map `NetworkError`/other errors to fixed Hebrew copy before rendering, never `err.message` or a stack trace
- [x] Client-side admin guard (`AdminRoute`) explicitly documented as UX-only, not a security boundary — PASS, and correctly relies on `isAdminSession` being derived purely from server-returned `roles` (`auth.slice.ts:28-35`), never settable by any other code path
- [ ] Native `@capacitor/preferences` surface — N/A, this ticket added no native-specific code (out of scope for a web-shell-only plan)

## Security Tests
`docs/tests/security/admindas-sec.security.test.ts`: **18 passed, 0 failed** (3 of the 18 are `it.fails` cases that intentionally record today's 404-gap behavior as an expected failure — see SEV-001; they will need to be flipped to plain `it` once the manifest endpoint ships).

Run alongside the two pre-existing security suites in the same directory to confirm no regression:
```
cd backend/tour-service
npx vitest run --config ../../docs/tests/security/vitest.security.config.ts
```
Result: 3 files, **40/40 tests passed** (18 new + 14 `gatewayl-sec` + 8 `seat-request-modal`).

A standalone `docs/tests/security/vitest.security.config.ts` was added (allowed path) because `docs/tests/security/**` is not in `backend/tour-service/vitest.config.ts`'s `include` glob, and this agent cannot edit that file. The config reuses `tour-service`'s own `globalSetup`/`setupFiles` (one shared in-memory Mongo instance) so all three spec files run together exactly as they would under the service's own `npm test`.

Coverage added by this ticket's suite: `requireAdmin`/`verifyToken` unit checks (missing/forged/expired/`alg:none`/non-admin token → 401/401/401/401/403, and no token/jwt-library-error echoed in the response body), `seat.status` client-injection rejection, one true concurrent-race assertion (`Promise.all`, not sequential) for `POST /api/seats/bookings`, soft-deleted tour/bus exclusion from list endpoints, CORS origin allow/deny, the manifest-endpoint gap (SEV-001, `it.fails`), and a PII-never-leaks-from-the-public-seat-map regression check.

## Dependency Audit
- `frontend`: **0 high, 0 critical** (`npm audit --audit-level=high`: clean, 221 total deps)
- `backend/tour-service`: **1 high, 1 critical** — both `esbuild <=0.24.2` via the `vite`/`vitest`/`vite-node` dev-tooling chain (SEV-003, LOW/non-blocking: dev-server-only, no production exposure, pre-existing)
- `backend/user-management-service`: out of scope — service does not exist in this repository

STATUS: BLOCKED
