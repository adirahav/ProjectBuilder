# Plan 009 — Customer Details Form (name/phone/email, creates Appointment)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: frontend, booking-service, notification-service, qa, security

## Goal
Build Screen 3 (Customer Details Form) from the PRD: a public, unauthenticated page that lets a customer who has just held a `TimeSlot` (plan 008) enter contact details (name required, phone required, email optional), submit to create the `Appointment` and finalize the held `TimeSlot` to `booked` (F4), trigger a confirmation notification (F4b), and show a countdown/expiry notice while the slot is held since the hold is short-lived.

## Scope
- In scope (`frontend/`): a `CustomerDetailsForm` page mounted at the existing `/book/:serviceId/details` placeholder route (from plan 008), a form with name/phone/email fields (client-side validation: name/phone required, email optional but format-checked if present), a live countdown showing time remaining on the held slot (reading `heldAt`/TTL from the booking store or a fresh server value), submit action calling `POST /api/appointments`, success navigation to the (still-placeholder) Booking Confirmation screen (Screen 4) with the created appointment data, hold-expired handling (if the countdown reaches zero or submit fails because the hold expired, show a clear message and route back to the Time Slot Picker), accessible error messaging (not color-only) per `accessibility-layer`, RTL/LTR-correct layout per `css-layer`, mobile-first responsive styling per `ui-component-layer`.
- In scope (`booking-service/`): `POST /api/appointments` (F4) — validates the referenced `TimeSlot` is currently `held` (and not hold-expired) and belongs to the given `serviceId`, creates an `Appointment` document (`serviceId`, `timeSlotId`, `customerName`, `customerPhone`, `customerEmail?`, `status: 'pending'`), atomically transitions the `TimeSlot` from `held` → `booked` (single conditional update, consistent with the hold's atomicity pattern — see `seat-concurrency-layer`), returns 409 with a clear payload if the slot is no longer `held` (already booked/expired) so the frontend can route back to slot picking; a minimal `Appointment` Mongoose model if not already present; after successful creation, a server-to-server call from `booking-service` to `notification-service` to trigger the confirmation notification (F4b), fire-and-forget/best-effort (appointment creation must not fail or roll back if the notification call fails).
- In scope (`notification-service/`): a minimal `POST /api/notifications/appointment-confirmation` (or equivalent) endpoint that accepts appointment/contact details and records/sends a confirmation notification; actual email/SMS delivery integration is out of scope — a stubbed/logged notification satisfying F4b's "triggers a confirmation notification" contract is sufficient for this task.
- Out of scope: Booking Confirmation screen itself (Screen 4 — the "success" path only needs to navigate there with data, not render it), Admin appointment management (Screen 7, F9–F11, including `status` transitions beyond the initial `pending` creation), real email/SMS provider integration in `notification-service`, `api-gateway` routing for these public routes (called directly against `booking-service`/`booking-service`→`notification-service`, consistent with plans 007/008's precedent), a scheduled sweeper for hold expiry (still lazy-only, per plan 008).
- Repo-relative scope: frontend changes under `frontend/src/`; backend changes under `booking-service/src/`; notification changes under `notification-service/src/`. No changes to `api-gateway/` or `user-service/`.

## Assumptions
- Plan 008 already established the `TimeSlot` model, the `held` status with `heldAt`/`HOLD_TTL_MS`, the booking Zustand store (`serviceId`, `date`, `heldSlotId`), and the `/book/:serviceId/details` placeholder route; this task replaces that placeholder with the real form and reuses the existing store/API-client patterns.
- `booking-service` has no `Appointment` model or `/api/appointments` route yet; this task adds the minimal model + F4 route needed, not the full admin CRUD surface (that's Screen 7's plan).
- `notification-service` (scaffolded in plan 006) has no notification-sending routes yet; this task adds the minimal endpoint needed to satisfy F4b, with actual delivery mocked/logged rather than integrated with a real provider.
- The countdown UI derives its remaining time from `heldAt + HOLD_TTL_MS` (server-authoritative fields already returned by plan 008's hold response), not a purely client-guessed timer, so it stays reasonably accurate even after navigation.
- Appointment `status` starts as `'pending'` per the PRD's Screen 7 description (Admin later confirms/cancels); this screen does not set `'confirmed'` itself.

## Open Questions
1. Should `POST /api/appointments` require the `slotId` (from the held slot) as the source of truth, or also re-validate `serviceId`/`date` from the request body against that slot?
   - Recommended: require only `slotId` in the request body plus the contact fields; derive `serviceId`/date/time from the `TimeSlot` document server-side so the client cannot spoof mismatched service/slot data — the client still sends `serviceId` for routing/UI purposes but the server treats the slot document as authoritative.
2. What should happen in the UI when the countdown reaches zero before the customer submits?
   - Recommended: disable the submit button, show an inline "Your hold has expired — please pick a new time" message with a button back to the Time Slot Picker for the same service/date, and rely on the server's 409-on-submit as the authoritative backstop in case the client timer drifts.
3. Should the notification call from `booking-service` to `notification-service` block the `POST /api/appointments` response, or be fire-and-forget?
   - Recommended: fire-and-forget (best-effort, logged on failure) — the PRD only requires the booking to "trigger" a notification, and making appointment creation depend on notification-service's availability would add an unnecessary coupling/failure mode to the core booking flow.
4. What fields/shape should `notification-service`'s new endpoint accept, given it has no existing contract yet?
   - Recommended: a minimal JSON body (`appointmentId`, `serviceName`, `date`, `startTime`, `customerName`, `customerEmail?`, `customerPhone`) sufficient to log/stub a confirmation message; keep it intentionally small since real delivery integration is explicitly out of scope, and treat this as the seed of the contract Screen 4/notification follow-ups can extend later.

## Steps
1. `booking-service/src/models/Appointment.js` — Mongoose schema: `serviceId` (ObjectId ref `Service`, required), `timeSlotId` (ObjectId ref `TimeSlot`, required), `customerName` (String, required), `customerPhone` (String, required), `customerEmail` (String, optional), `status` (enum `pending|confirmed|cancelled`, default `pending`), timestamps.
2. `booking-service/src/routes/appointments.js` — `POST /api/appointments` handler: validate request body (name/phone required, email format if present), look up the `TimeSlot` by `slotId`, confirm it is currently `held` and not hold-expired; if not, return 409 with a clear conflict payload. If valid, create the `Appointment` document and atomically transition the `TimeSlot` `held` → `booked` (single conditional update). On success, fire a best-effort call to `notification-service`'s new endpoint (catch/log failures without failing the request), then return 201 with the created `Appointment`.
3. `booking-service/src/server.js` — mount the new appointments router under `/api/appointments`.
4. `notification-service/src/routes/notifications.js` — `POST /api/notifications/appointment-confirmation` handler: validate the minimal payload (Open Question 4), log/stub the "sent" confirmation (e.g. `console.log` or an in-memory record), return 200/201.
5. `notification-service/src/server.js` — mount the new notifications router.
6. `frontend/src/api/appointments.ts` — `createAppointment(payload)` function, typed to an `Appointment` interface, calling `booking-service` directly.
7. `frontend/src/store/booking.ts` — extend with the fields needed for the countdown (`heldAt`, `holdTtlMs`) if not already stored from plan 008's hold response.
8. `frontend/src/pages/CustomerDetailsForm/CustomerDetailsForm.tsx` — page component: reads `serviceId`/`heldSlotId`/`heldAt` from the booking store (redirect back to Time Slot Picker if missing), renders the name/phone/email form with client-side validation, renders the live countdown, handles submit → calls `createAppointment`, on success stores the resulting `Appointment` and navigates to the (placeholder) Booking Confirmation route, on 409/expiry shows the expired-hold message and a way back to slot picking.
9. `frontend/src/pages/CustomerDetailsForm/CountdownNotice.tsx` — presentational component per `ui-component-layer`/`accessibility-layer`: text-based countdown (not color-only), announces expiry via accessible live-region text, not merely a visual timer.
10. `frontend/src/router.tsx` — replace the plan-008 placeholder at `/book/:serviceId/details` with `CustomerDetailsForm`, and add a placeholder route `/book/:serviceId/confirmation` for the next screen (Screen 4), mirroring plans 007/008's "establish the navigation contract" pattern.
11. Manual verification: hold a slot via plan 008's flow, land on the new form, submit valid details and confirm the `Appointment` is created, the `TimeSlot` flips to `booked`, and a notification-service log entry appears; separately, let a hold expire (or hold-then-book from a second flow) and confirm submitting shows the expired/conflict message and routes back to slot picking.

## Validation
- `POST /api/appointments` with a valid `slotId` still in `held` state (not expired) returns 201, creates a `pending` `Appointment`, and flips the referenced `TimeSlot` to `booked`.
- `POST /api/appointments` with a `slotId` that is `open`, `booked`, or hold-expired returns 409 and does not create an `Appointment` or mutate the `TimeSlot`.
- `POST /api/appointments` rejects missing `customerName`/`customerPhone` with a 400 and a clear validation error; `customerEmail` is accepted when omitted and validated for format when present.
- A concurrency check: firing the same `POST /api/appointments` twice for the same held slot (e.g. double-submit) results in exactly one 201 and one 409 — verifying the `held`→`booked` transition is atomic, not read-then-write.
- After a successful appointment creation, `notification-service`'s endpoint receives/logs a call; a simulated failure of that call (e.g. service down) does not prevent the `POST /api/appointments` response from succeeding.
- Frontend: the countdown visibly counts down and is announced via text (not color alone); submitting after the countdown/server both agree the hold is gone shows the expired message and offers a path back to the Time Slot Picker; a successful submit navigates to the confirmation placeholder route carrying the created appointment data.
- Keyboard-only navigation can reach and complete every form field and the submit button; validation errors are associated with their fields for screen readers.
- No changes leak into `api-gateway/` or `user-service/`.

## Risks
- **Concurrency correctness on the booking transition**: a slot must never be `booked` twice, and this endpoint is the second half of the hold→book lifecycle first established in plan 008. Mitigated by using the same single atomic conditional Mongo update pattern (`held`→`booked`) rather than a read-then-write, and by including a concurrent double-submit test in Validation. `booking-service` is in Scope-Agents specifically for this reason.
- **New unauthenticated mutation endpoint with PII**: `POST /api/appointments` is public by design (no login for customers) but accepts and stores personally identifiable contact details (name, phone, email) — an integrity/abuse and data-handling concern even though the PRD calls for unauthenticated public routes. `security` is included in Scope-Agents to review input validation, injection/XSS handling of free-text name field, and whether any rate-limiting or basic abuse mitigation should be flagged (even if not implemented in this task).
- **Cross-service call introduces a new failure mode**: `booking-service` now calls `notification-service` synchronously-triggered-but-fire-and-forget; if not implemented carefully, a hang or unhandled rejection in that call could block or crash the appointment-creation request despite the "best-effort" intent. Mitigated by explicitly specifying a caught/logged, non-blocking call in Steps, and `notification-service` is included in Scope-Agents because this task adds real code to it (a new route), not merely because it's referenced.
- **Client-side countdown can drift from server truth**: relying on a client timer for UX risks a customer submitting just as a hold expires. Mitigated by treating the server's 409 response as the authoritative backstop (per Open Question 1/2) rather than trusting the client timer to gate submission correctness.
- No `user-service` or `api-gateway` code is touched, so they are correctly excluded from Scope-Agents; this task calls `booking-service` and `notification-service` directly, consistent with plans 007/008's precedent of not yet routing public endpoints through the gateway.

## Rollout Order
1. Backend slice first: `Appointment` model + `POST /api/appointments` route in `booking-service` (Steps 1–3), verified via direct HTTP calls including the concurrent double-submit test.
2. `notification-service` minimal confirmation endpoint (Steps 4–5), verified via a direct HTTP call.
3. Wire `booking-service` → `notification-service` best-effort call into the appointments route (part of Step 2, validated end-to-end once both services are up).
4. Frontend API layer + booking-store extension (Steps 6–7).
5. Frontend feature: `CustomerDetailsForm` page + `CountdownNotice`, wired into the router replacing the plan-008 placeholder (Steps 8–10).
6. End-to-end manual verification against all three running services (Step 11 / Validation).

## Rollback
- Frontend: remove `frontend/src/pages/CustomerDetailsForm/`, `frontend/src/api/appointments.ts`, revert the `booking.ts` store additions, and revert `router.tsx`'s `/book/:serviceId/details` entry back to plan 008's placeholder.
- Backend (`booking-service`): remove `booking-service/src/models/Appointment.js` and `booking-service/src/routes/appointments.js`, unmount the router from `server.js`; no other route yet depends on `Appointment`, so removal is isolated.
- Backend (`notification-service`): remove the new notifications route file and unmount it from `server.js`; isolated since no other service yet calls it besides this task's own `booking-service` addition, which is removed alongside it.
