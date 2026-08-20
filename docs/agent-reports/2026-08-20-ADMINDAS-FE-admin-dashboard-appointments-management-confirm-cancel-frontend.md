A previous run of this ticket had timed out mid-way (see the `.blocked.md` report) after building the UI but before tests, contracts, or verification. I reviewed all of its uncommitted work, found it sound and complete, then finished the remaining steps: tests, the API contract, and validation.

**What was already in place (verified, not rewritten):** types (`AdminAppointment`, `AppointmentFilter`, `AppointmentActionOutcome`), the three service functions on the gateway client, the Admin half of the appointment slice, the page plus three components, the `/admin/appointments` route, the dashboard link, and full en/he i18n.

**What I added:**
- `buildAdminAppointment` factory.
- 39 service-layer tests — filter serialization (malformed date/status omitted rather than sent), gateway-not-booking-service routing, id escaping, non-array body degrading to `[]`, and 409/404 surfacing.
- 29 slice + page tests — sort order, the stale-list reload on 409/404, independent filters, and the merge behavior that stops a bare `PATCH` response from blanking a row's service name.
- The three `/api/appointments` admin routes in the gateway contract, with `AdminAppointment`, `AppointmentNotFound`, and `AppointmentConflict`.

Two notes worth flagging. First, the plan's Open Question 3 (the two-collection write) is specified in the contract as the server's responsibility, ordered so the Appointment transition is the precondition and slot release is idempotent — the client makes exactly one request, which a test pins. Second, **no e2e harness exists in this repo** and I did not add one: the endpoints aren't implemented server-side yet, so there's nothing to run end-to-end against. The critical Screen 7 flows are covered instead by full-page integration tests mounting `AppRoutes` through the real router, guard, and store. I'd suggest a visual pass once the backend lands.

=== FRONTEND AGENT REPORT ===
```
Ticket: ADMINDAS-FE
Pages built/changed: AdminAppointmentsPage.tsx (new), AdminDashboardPage.tsx (appointments card now a live link), App.tsx (/admin/appointments behind ProtectedRoute)
Components built/changed: AdminAppointmentTable.tsx, AppointmentFilters.tsx, CancelAppointmentDialog.tsx (all new)
Services built/changed: appointment.service.ts (getAdminList, confirm, cancel, toAdminListParams — all via gatewayHttpService)
Store slices built/changed: appointment.slice.ts (adminAppointments, appointmentFilter, isSavingAppointment, loadAdminAppointments, confirmAppointment, cancelAppointment)
Supporting: types/appointment.types.ts, utils/appointmentStatus.utils.ts, i18n/strings.ts (en + he), test/factories.ts
Lint: PASS
Build: PASS
Tests: 468 passed, 0 failed (68 new; 25 files)
E2E: no harness exists in this repo and none was added — the endpoints are not implemented yet. Critical flows covered by full-page integration tests instead.
API contracts:
  - docs/api-contract/api-contract.api-gateway.yaml

Handoff to Backend Agent:
- Implement endpoints per service contract above
- GET /api/appointments, PATCH /api/appointments/:id/confirm, PATCH /api/appointments/:id/cancel — all behind verifyJwt
- Cancel must release the linked TimeSlot to 'open' server-side; the client makes exactly one request
- Both PATCHes must be conditional on current status so concurrent submits yield one success + one 409
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```