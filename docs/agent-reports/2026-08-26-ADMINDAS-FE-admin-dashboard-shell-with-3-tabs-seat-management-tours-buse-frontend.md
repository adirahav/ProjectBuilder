Full suite is clean: 15 files, 223 tests, zero errors, zero worker warnings.

Two things worth calling out from this last pass. The serialized run didn't just remove noise — it exposed six genuine failures the parallel run had been masking behind worker-start timeouts, and one of them was a real accessibility bug, not a test artifact: `formatSeatAriaLabel` unconditionally appended "לחצו לשליחת בקשה", so the read-only admin seat map was announcing a request action it cannot perform. Fixed in `seat.utils.ts` with an `isInteractive` parameter that `SeatButton` now passes, plus a unit test covering the read-only label. The other five were test-side: `userEvent.setup()` silently replaces `navigator.clipboard`, so the copy assertions were watching a spy the component never called, and one status assertion was matching the filter's `<option>` text instead of the table rows.

=== FRONTEND AGENT REPORT ===
Ticket: ADMINDAS-FE

Pages built/changed:
- `frontend/src/pages/AdminPage.tsx` — rebuilt as the 3-tab shell
- `frontend/src/pages/ToursPage.tsx` — refactored onto the shared StatePanel

Components built/changed:
- `components/routing/AdminRoute.tsx` (new)
- `components/admin/SeatManagementTab.tsx` (new)
- `components/admin/ToursBusesTab.tsx` (new)
- `components/admin/PassengerManifestTab.tsx` (new)
- `components/common/StatePanel.tsx` (new)
- `components/common/SeatMap.tsx` — `onSelectSeat` now optional (read-only mode)
- `components/common/SeatButton.tsx` — narrowing fix + read-only accessible name
- `App.tsx` — `/admin` wrapped in `AdminRoute`

Services built/changed:
- `services/manifest.service.ts` (new — the only tour-service call with `withAuth: true`)
- `services/bus.service.ts` — added `listBusesForTour` (no store write)

Store slices built/changed:
- `store/slices/manifest.slice.ts` (new)
- `tour.slice.ts` + `bus.slice.ts` — cascade-clear `manifest`
- `store.ts` — slice assembled

Utils: `utils/manifest.utils.ts` (new), `utils/seat.utils.ts` (read-only aria-label)

Lint: PASS
Build: PASS
Tests: 223 passed, 0 failed

API contracts:
- `docs/api-contract/api-contract.tour-service.yaml`

Handoff to Backend Agent:
- Implement `GET /api/buses/{busId}/manifest` per the contract — admin JWT required; 401 on missing/invalid/expired, 403 on non-admin roles, 404 on unknown bus
- Add JWT verification middleware to tour-service using user-management-service's signing secret and algorithm; verify signature **and** expiry, read `roles` only from verified claims
- The manifest response is the only payload in this contract carrying passenger identity (`fullName`, `phone`). Never log it — log ids and counts only. Send `Cache-Control: no-store`. Do not expose these fields from the public seat-map endpoint
- See `.rule/database-rules.md` for collection schemas

Notes:
- The guard is named `AdminRoute`, not the plan's `RequireAdmin`, to comply with `.rule/naming-rules.md` (`<Name>Route.tsx`); rationale is recorded in its JSDoc. It is a UX guard, not a security boundary — enforcement is server-side
- All `backend/**` steps in plan 009 were deliberately left to the Backend Agent per CLAUDE.md's forbidden-paths rule, and specified in the contract instead
- Deferred seat-action buttons (F6–F10) are omitted entirely rather than stubbed, per plan Open Question 3
- `vitest.config.ts` now runs `maxWorkers: 1`; the parallel pool was masking real failures behind worker-boot timeouts
- The app was never launched (CLAUDE.md forbids running dev servers), so visual confirmation of the RTL layout is left to QA

STATUS: DONE