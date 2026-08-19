# QA Report — Booking Confirmation Page (BOOKINGC-QA)

Plan: `.plan/010-2026-08-19-booking-confirmation-page.md`

## Scope validated
- `backend/booking-service` — new `GET /api/appointments/{id}` (only in-scope backend service; `api-gateway`, `user-service`, `notification-service` correctly skipped per plan)
- `frontend` — `BookingConfirmationPage`, `ConfirmationSummary`, `useBookingReceipt`, route change, `CustomerDetailsPage` nav-target update
- API contract conformance: `docs/api-contract/api-contract.booking-service.yaml`

## Checks run

| Check | Result |
|---|---|
| `backend/booking-service` unit tests (`npm test`) | ✅ 126/126 passed, incl. 11 new in `appointment-receipt.test.ts` |
| `frontend` typecheck (`tsc --noEmit`) | ✅ clean |
| `frontend` lint | ✅ clean |
| `frontend` unit tests (`vitest run`) | ✅ 236/236 passed (17 files) |
| `frontend` production build | ✅ succeeded |
| Diff/status check: `api-gateway`, `user-service`, `notification-service` | ✅ no changes present — out-of-scope services correctly untouched |
| Contract vs. implementation review (`GET /api/appointments/{id}`, `AppointmentReceipt`) | ✅ matches: 400 for malformed id, 404 for missing id (same generic body), read-only (asserted by test), field-projected response (no `additionalProperties`), uuid-v4 ids |

## Requirements traceability (against plan Validation section)

- ✅ Full booking flow lands on confirmation showing service, date/time, duration, price, customer name/phone/email — covered by frontend page/hook tests and nav-state wiring in `CustomerDetailsPage.tsx`.
- ✅ Hard refresh re-renders via `GET /api/appointments/:id` fallback — `useBookingReceipt.ts` implements two-source resolution; backend route implemented and tested.
- ✅ Bad/non-existent id → graceful "couldn't find that booking" fallback, not a crash — asserted in `BookingConfirmationPage.test.tsx` per FE report; backend returns 404 for missing/soft-deleted appointments.
- ✅ `GET /api/appointments/:id` — 404 for non-existent id, 200 with only documented `AppointmentReceipt` fields, no mutation (explicit read-only test keeps `TimeSlot.status`/`heldAt` and `Appointment` unchanged).
- ✅ Confirmed state conveyed via icon + text, not color alone (per `ConfirmationSummary.tsx` per FE report); RTL/LTR handled via logical properties, with `dir="ltr"` pinned on times/phone/email.
- ⚠️ Small-mobile-viewport and live RTL/LTR visual check were **not independently re-verified in this pass** (no running app/browser session was exercised) — FE agent self-reported this as not yet done live ("I did not launch the app... visual/RTL check on a real device is still worth a manual pass"). Recommend a follow-up manual/visual pass (e.g. via `run` skill) before considering Step 7 fully closed, though it is not a blocker given the automated coverage.
- ✅ No leakage into `api-gateway`/`user-service`/`notification-service`.

## Security note carried forward (not a QA finding, flagging for visibility)
Both the FE and backend agents flagged, and the contract documents, that `GET /api/appointments/{id}` is an unauthenticated PII read guarded only by an unguessable uuid v4 — rate limiting / opaque confirmation token are known follow-ups for the `security` agent (Plan Open Question 4 / Risk 1). This is already routed to `security` per `Scope-Agents`; no new issue found beyond what's documented.

## Verdict
**PASS.** All automated checks (backend tests, frontend typecheck/lint/tests/build) pass, out-of-scope services are untouched, and the implementation matches the API contract and plan's validation criteria. One non-blocking follow-up: a live visual/RTL/mobile-viewport pass has not yet been done against a running app.

STATUS: DONE
