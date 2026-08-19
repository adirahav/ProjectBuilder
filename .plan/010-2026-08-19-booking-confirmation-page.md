# Plan 010 — Booking Confirmation Page

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-19
- Scope-Agents: frontend, qa, security

## Goal
Build Screen 4 (Booking Confirmation) from the PRD: a public, unauthenticated page that displays a summary of the just-booked `Appointment` (service, date/time, price, contact details entered) as the customer's only receipt, replacing the placeholder route left by plan 009 at `/book/:serviceId/confirmation`.

## Scope
- In scope (`frontend/`): a `BookingConfirmation` page mounted at the existing `/book/:serviceId/confirmation` placeholder route (from plan 009), rendering the appointment summary (service name, date, start time, duration, price, customer name/phone/email) from data passed via navigation state (the `Appointment` returned by plan 009's `POST /api/appointments` call) or, on a hard refresh/direct visit where nav state is unavailable, from a fetch by appointment id if one is present in the URL; a clear "no receipt available" fallback state (with a link back to the Service List) when neither nav state nor a valid id is present; RTL/LTR-correct layout per `css-layer`; mobile-first responsive styling per `ui-component-layer`; accessible, non-color-only presentation of the confirmed state per `accessibility-layer`; a "Book another appointment" action returning to the Service List (Screen 1).
- In scope (`booking-service/`): only if Open Question 1 resolves to "support fetch-by-id" — a minimal `GET /api/appointments/:id` read endpoint returning the appointment summary fields needed by the confirmation page (no mutation, no auth per PRD's public booking routes). If Open Question 1 resolves to "nav-state only," no backend changes are made in this task.
- Out of scope: Admin appointment management (Screen 7, F9–F11), any change to the appointment-creation flow itself (plan 009), email/SMS receipt delivery (notification-service's actual send integration remains stubbed per plan 009), `api-gateway` routing (this stays a direct public call to `booking-service`, consistent with plans 007–009's precedent), printable/downloadable receipt formats.
- Repo-relative scope: frontend changes under `frontend/src/`; conditional backend changes (see Open Question 1) under `booking-service/src/`. No changes to `api-gateway/`, `user-service/`, or `notification-service/`.

## Assumptions
- Plan 009 already navigates to `/book/:serviceId/confirmation` on successful appointment creation, passing the created `Appointment` (with populated/derivable service name, date, start time, price, and the customer-entered contact fields) via router navigation state.
- The `Appointment` document (or the data plan 009 already has in hand client-side at the moment of navigation) contains enough fields to render the summary without a further server round-trip in the common case (customer completes booking in one flow and lands here immediately).
- This screen does not require authentication and does not expose any data beyond what the customer themselves just submitted.
- No new Zustand store is needed; the confirmation data is short-lived, page-scoped state (nav state or local fetch result), not global booking-flow state that needs to persist.

## Open Questions
1. Should the confirmation page support being reloaded/revisited directly (e.g. via a shareable link with an appointment id), requiring a backend `GET /api/appointments/:id`, or is nav-state-only (lost on refresh) acceptable for v1?
   - Recommended: support both — use nav state when present (no extra request, fastest path) and fall back to a lightweight `GET /api/appointments/:id` (added to `booking-service`) when the page is loaded without nav state but a valid id is in the URL, since the PRD explicitly says this screen "is the only receipt the customer gets," implying it should survive a refresh.
2. Should the confirmation URL include the appointment id (e.g. `/book/:serviceId/confirmation/:appointmentId`) to make the fallback fetch and future "shareable receipt" use cases possible?
   - Recommended: yes — change the route to `/book/:serviceId/confirmation/:appointmentId`, with plan 009 updated to navigate to that id-bearing path (still passing nav state for the fast path), so a refresh has something to fetch by.
3. What should the fallback UI show when there is neither nav state nor a resolvable appointment (bad id, deleted, network error)?
   - Recommended: a plain "We couldn't find that booking" message (not a raw error) with a link back to the Service List, so a mistyped/stale URL degrades gracefully instead of showing a blank or broken page.
4. Should `GET /api/appointments/:id` (if added) return full appointment data unauthenticated, given it's a public route with no per-customer secret/token in the id?
   - Recommended: return only the fields needed for the receipt (service name, date/time, duration, price, customer name/phone/email as entered) and treat the appointment's MongoDB ObjectId as an unguessable-enough capability token for v1 (consistent with the PRD's no-login public flow), but flag this as a real PII-exposure tradeoff for `security` to review — a determined party enumerating ids could read other customers' contact details, which is worth a follow-up (e.g. rate limiting or a separate opaque confirmation token) beyond this task's scope.

## Steps
1. `frontend/src/api/appointments.ts` — extend with `getAppointment(id)` calling `GET /api/appointments/:id` on `booking-service`, typed to the existing `Appointment` interface (only if Open Question 1/2 resolve as recommended).
2. `booking-service/src/routes/appointments.js` — add `GET /api/appointments/:id` handler: look up the `Appointment` by id, populate/derive service name and slot date/time, return 200 with the summary fields or 404 if not found (only if Open Question 1/2 resolve as recommended).
3. `frontend/src/pages/BookingConfirmation/BookingConfirmation.tsx` — page component: reads the `Appointment` from router navigation state if present; otherwise, if `:appointmentId` is in the URL, calls `getAppointment(id)` and shows a loading state while fetching; renders the summary (service, date/time, duration, price, customer name/phone/email) on success; renders the not-found fallback (Open Question 3) when neither source resolves; includes a "Book another appointment" link back to the Service List route.
4. `frontend/src/pages/BookingConfirmation/ConfirmationSummary.tsx` — presentational component per `ui-component-layer`: displays the confirmed booking as a labeled summary card, uses an icon + text (not color alone) to convey "confirmed" status per `accessibility-layer`, RTL/LTR-correct via logical CSS properties per `css-layer`.
5. `frontend/src/router.tsx` — replace the plan-009 placeholder route with `/book/:serviceId/confirmation/:appointmentId` mounting `BookingConfirmation` (path change per Open Question 2).
6. `frontend/src/pages/CustomerDetailsForm/CustomerDetailsForm.tsx` (plan 009 file, minimal touch-up) — update the post-submit navigation target to the new `/book/:serviceId/confirmation/:appointmentId` path, still passing the created `Appointment` via nav state for the fast path.
7. Manual verification: complete a full booking flow (plans 007→008→009→010) and confirm the summary renders correctly from nav state; then hard-refresh the confirmation URL and confirm it re-renders the same summary via the fallback fetch; then visit a confirmation URL with a bogus id and confirm the graceful not-found fallback.

## Validation
- Completing the booking flow (service → slot → details → submit) lands on the confirmation page showing the correct service name, date, time, duration, price, and the exact name/phone/email the customer entered.
- Hard-refreshing the confirmation page (losing nav state) re-renders the same summary via `GET /api/appointments/:id`, if Open Questions 1/2 are implemented as recommended.
- Visiting the confirmation route with a non-existent or malformed appointment id shows the "couldn't find that booking" fallback, not a crash or blank page, and offers a link back to the Service List.
- `GET /api/appointments/:id` (if added) returns 404 for a non-existent id and 200 with only the documented summary fields for a valid id; it performs no mutation.
- The confirmed state is conveyed with an icon/text label, not color alone; layout is correct in both RTL (Hebrew) and LTR (English); the page is usable on a small mobile viewport.
- No changes leak into `api-gateway/`, `user-service/`, or `notification-service/`.

## Risks
- **New unauthenticated read endpoint exposing PII by id**: `GET /api/appointments/:id` (if added) returns customer name/phone/email to anyone who can guess or obtain a valid ObjectId, with no auth check by design (public flow). `security` is included in Scope-Agents specifically to review this tradeoff (see Open Question 4) even though no write/mutation is involved — data-exposure risk on a PII-bearing endpoint warrants review regardless of read-only status.
- **Route/path change ripples into plan 009's navigation**: changing the confirmation path to include `:appointmentId` requires a coordinated, minimal edit to plan 009's already-shipped `CustomerDetailsForm.tsx` (Step 6); missing this would leave the post-booking redirect pointing at a stale/placeholder path. Called out explicitly as a Step and re-checked in Validation's end-to-end flow.
- **Fallback-fetch dependency on `booking-service` being reachable**: if `booking-service` is down when a customer refreshes the confirmation page, the fallback fetch fails; mitigated by the graceful not-found/error fallback (Open Question 3) rather than a blank/crashed page. This is a UX degradation, not a data-integrity risk, so it does not require additional Scope-Agents beyond `frontend`.
- No `user-service`, `api-gateway`, or `notification-service` code is touched, so they are correctly excluded from Scope-Agents.

## Rollout Order
1. Decide/confirm Open Questions 1–2 (nav-state-plus-fallback-fetch, id-in-path) before starting, since they determine whether Steps 1–2 (backend) are needed at all.
2. Backend slice (if applicable): `GET /api/appointments/:id` in `booking-service` (Step 2), verified via a direct HTTP call for both a valid and an invalid id.
3. Frontend API layer extension (Step 1).
4. Frontend feature: `BookingConfirmation` page + `ConfirmationSummary` component (Steps 3–4).
5. Router path change (Step 5) and the coordinated plan-009 navigation update (Step 6), landed together so the redirect and the new route stay in sync.
6. End-to-end manual verification across the full booking flow, refresh, and bad-id cases (Step 7 / Validation).

## Rollback
- Frontend: remove `frontend/src/pages/BookingConfirmation/`, revert `frontend/src/api/appointments.ts`'s `getAppointment` addition, revert `router.tsx`'s confirmation route back to plan 009's placeholder, and revert the navigation-target edit in `CustomerDetailsForm.tsx` back to the pre-existing placeholder path.
- Backend (`booking-service`): remove the `GET /api/appointments/:id` handler from `booking-service/src/routes/appointments.js`; isolated since it is a new, read-only, additive route with no other dependents.
