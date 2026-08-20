Everything verified against the plan. The prior run's implementation is on disk and complete; I confirmed the wiring, accessibility, and contract myself rather than relying on its claims, and re-ran all checks.

**What's in place (PRD F6–F8, Screen 6):**
- `AdminServicesPage` — loads all services (active + inactive) via the store, with loading skeleton, error+retry, empty state, and an `aria-live` region. Status is rendered as **icon + word**, never color alone. A `404` on a write is handled as its own case (message + list reload) rather than an unwinnable retry.
- `ServiceForm` — one modal for create and edit; edit diffs the patch and refuses an empty one. The `isActive` toggle appears only in edit mode, which is the sanctioned route back from a deactivation (plan Open Question 3).
- `DeactivateServiceDialog` — confirmation step, copy states honestly that it's a soft delete.
- `ModalDialog` — focus trap with wrap at both ends, focus restore to the opener, Escape-to-close, `role="dialog"` + `aria-modal`.
- Admin API layer routes through `gatewayHttpService` (so the JWT is attached), never `booking-service` directly; `/admin/services` sits behind the existing `ProtectedRoute`.

**Two things worth flagging:**
1. `vitest`'s default threaded pool times out spawning workers on this machine — the suite only completes with `--no-file-parallelism`. That's an environment quirk, but CI will need the same flag.
2. No e2e framework exists in this repo. The Admin login → manage services flow is covered end-to-end at the component level by mounting `AppRoutes`, but a true cross-service harness (including the two-simultaneous-holds `409` race, which this ticket doesn't touch) remains an open gap I did not close.

I did not launch a dev server, per instructions — the modal on a narrow viewport and in RTL is worth an eyeball before sign-off.

=== FRONTEND AGENT REPORT ===
```
Ticket: ADMINDAS-FE
Pages built/changed: AdminServicesPage (new), AdminDashboardPage (placeholder -> nav shell), App.tsx (/admin/services route)
Components built/changed: admin/ServiceForm (new), admin/AdminServiceTable (new), admin/DeactivateServiceDialog (new), common/ModalDialog (new), common/FormField (numeric/decimal inputMode)
Services built/changed: service.service.ts (getAllServices/createService/updateService/deactivateService via gatewayHttpService; isMissingServiceError predicate)
Store slices built/changed: service.slice.ts (adminServices, isLoadingAdminServices, hasAdminServicesError, isSavingService + load/create/update/deactivate actions)
i18n: adminServices.* and admin.dashboard.* keys added in both he and en
Lint: PASS
Build: PASS
Tests: 400 passed, 0 failed (23 files; run with `npm --prefix frontend run test -- --no-file-parallelism`)
API contracts:
  - docs/api-contract/api-contract.api-gateway.yaml

Handoff to Backend Agent:
- Implement endpoints per service contract above:
  - GET   /api/services/all            -> all Services, no isActive filter
  - POST  /api/services                -> 201 + created record, always isActive: true, no client-supplied isActive
  - PATCH /api/services/:id            -> apply only present fields; empty body 400; isActive: true must be accepted
  - PATCH /api/services/:id/deactivate -> sets isActive: false only, no cascade to TimeSlot/Appointment
- All four must answer 401 without a valid Bearer token, and 404 for an unknown id.
- Responses must expose `id` (uuid), never Mongo's `_id`.
- The public GET /api/services stays unauthenticated and active-only — unchanged.
- See .rule/database-rules.md for collection schemas
```

STATUS: DONE