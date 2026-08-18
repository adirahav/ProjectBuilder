# PRD — Dog Grooming Clinic Booking

**Version:** 1.0
**Status:** In Development

---

## Overview
A booking system for a small dog grooming clinic. Customers browse the clinic's services, pick an available `TimeSlot`, and book an appointment as a guest — no account required. The clinic owner (`Admin`) manages which `Service`s are offered and reviews, confirms, or cancels `Appointment`s from a dashboard. The core workflow is: browse services → pick a slot → confirm booking (customer side), and: manage services → review/confirm/cancel appointments (admin side).

---

## Screens

### Screen 1 — Service List (public, `/`)
- Grid/list of active `Service`s: name, duration, price.
- Tapping a `Service` navigates to the booking flow for that service.
- Language switcher (Hebrew/English) visible on every public screen.
- Empty state if no services are configured yet.

### Screen 2 — TimeSlot Picker (public, `/book/:serviceId`)
- Shows the selected `Service`'s name, duration, and price at the top.
- Date picker (defaults to today/next available day).
- Grid of `TimeSlot`s for the selected date: each slot shows its start time and is disabled/greyed out if not `available` (status must never be conveyed by color alone — see `accessibility-layer` skill).
- Selecting an available slot holds it (`available → held`) and advances to the contact-details step.
- If the hold expires before the customer completes booking, the slot is released and the picker refreshes.

### Screen 3 — Contact Details & Confirm (public, `/book/:serviceId/:timeSlotId/confirm`)
- Form: customer name (required), phone number (required).
- Summary of the chosen `Service` and `TimeSlot`.
- "Confirm booking" submits the appointment.
- On conflict (slot was taken by someone else first), shows an explicit "this slot is no longer available" error and returns the customer to the TimeSlot Picker.
- On success, navigates to the confirmation screen.

### Screen 4 — Booking Confirmation (public, `/appointments/:id`)
- Shows the booked `Appointment`: service, date/time, status (`pending` until admin confirms), customer name.
- No login/account created — this is a shareable confirmation view, not a personal dashboard.

### Screen 5 — Admin Login (`/admin/login`)
- Email + password form.
- On success, stores the JWT and redirects to the admin dashboard.
- On failure, shows an inline error (no field-specific hints beyond "invalid credentials").

### Screen 6 — Admin Dashboard — Appointments (`/admin/appointments`, protected)
- Day/date-filtered list of `Appointment`s: customer name, phone, service, time, status.
- Status shown with both an icon/label and a color (never color alone) — see `accessibility-layer` skill.
- Actions per row: "Confirm" (only on `pending`), "Cancel" (on `pending`/`confirmed`).
- Cancelling releases the underlying `TimeSlot` back to `available`.

### Screen 7 — Admin Dashboard — Services (`/admin/services`, protected)
- List of all `Service`s (active and deactivated), with name, duration, price, status.
- "Add service" opens a create form (name, duration, price).
- Edit inline or via a modal for existing services.
- "Deactivate" soft-deletes a service (removed from public list, not hard-deleted); deactivated services remain visible in this admin list.

---

## Functional Requirements

| ID | Requirement | API Route / Service |
|---|---|---|
| F1 | Customer can view all active services with duration and price | `GET /api/services` (`appointment-service`) |
| F2 | Customer can view available time slots for a service on a given date | `GET /api/timeslots?serviceId=&date=` (`appointment-service`) |
| F3 | Selecting a slot holds it for the duration of the booking transaction | `POST /api/timeslots/:id/hold` (`appointment-service`) |
| F4 | Customer can submit contact details and confirm a booking | `POST /api/appointments` (`appointment-service`) |
| F4b | A booking attempt on an already-held/booked slot fails with a clear conflict response | `POST /api/appointments` (`appointment-service`) — 409 response |
| F5 | Customer can view their appointment confirmation | `GET /api/appointments/:id` (`appointment-service`) |
| F6 | Admin can log in | `POST /api/auth/login` (`user-service`) |
| F7 | Admin can view appointments filtered by date | `GET /api/appointments?date=` (`appointment-service`) |
| F8 | Admin can confirm a pending appointment | `PATCH /api/appointments/:id/confirm` (`appointment-service`) |
| F9 | Admin can cancel an appointment, releasing its time slot | `PATCH /api/appointments/:id/cancel` (`appointment-service`) |
| F10 | Admin can view all services (active + deactivated) | `GET /api/services` (`appointment-service`, admin-scoped query) |
| F11 | Admin can create a service | `POST /api/services` (`appointment-service`) |
| F12 | Admin can edit a service | `PATCH /api/services/:id` (`appointment-service`) |
| F13 | Admin can deactivate a service | `PATCH /api/services/:id/deactivate` (`appointment-service`) |

---

## Non-Functional Requirements
- UI supports Hebrew (RTL, default) and English (LTR); layout uses logical CSS properties so direction is config-driven, not hardcoded — see `css-layer` skill.
- Web and native (Capacitor/Android/iOS) both ship the same feature set — see `native-navigation-layer` skill for back-button/navigation-stack behavior on native.
- Accessibility target: WCAG AA. `Appointment`/`TimeSlot` status is never conveyed by color alone — see `accessibility-layer` skill.
- All admin-only routes require a valid JWT with `role: admin`, enforced server-side (gateway + service-level checks on the trusted header), never only hidden in the UI — see `jwt-middleware-layer` skill.
- `TimeSlot` claims are concurrency-safe: exactly one of two simultaneous booking attempts on the same slot succeeds — see `seat-concurrency-layer` skill and `database-rules.md`.
- Deletion model is soft-delete throughout: `Service.isActive`/`deactivatedAt`, `Appointment.status = cancelled` — nothing is hard-deleted — see `database-rules.md`.
- No real-time push sync required in v1 (slot picker refreshes on hold-expiry/poll, not via websockets).

---

## Acceptance Criteria
- **AC-1:** A customer can complete the full happy-path flow — browse services → pick a service → pick an available slot → enter contact details → confirm — and land on a confirmation screen showing `status: pending`.
- **AC-2:** When two customers attempt to book the same `TimeSlot` at the same time, exactly one booking succeeds; the other receives a conflict error and the slot is not double-booked.
- **AC-3:** A `held` `TimeSlot` that is not completed within the hold timeout automatically returns to `available` and can be booked by another customer.
- **AC-4:** An admin can log in with valid credentials and is redirected to the dashboard; invalid credentials show an inline error and no token is issued.
- **AC-5:** An admin confirming a `pending` appointment updates its status to `confirmed` and this is reflected immediately in the dashboard list.
- **AC-6:** An admin cancelling an appointment updates its status to `cancelled` and its `TimeSlot` becomes `available` again in the public slot picker.
- **AC-7:** A deactivated `Service` no longer appears in the public service list (Screen 1) but still appears in the admin services list (Screen 7) — soft-delete is invisible in public views, not actually removed.
- **AC-8:** Every `Appointment`/`TimeSlot` status in the UI is conveyed with an icon or text label in addition to color.
- **AC-9:** The native (Capacitor) build renders the same screens and flows as the web build, with correct back-button behavior per `native-navigation-layer` skill (e.g. back from the TimeSlot picker returns to the service list, not out of the app).
- **AC-10:** Attempting to access any `/admin/*` route without a valid admin JWT redirects to the admin login screen; attempting an admin API call without a valid token/role returns 401/403, not a silently-empty response.

---

## Data Model
See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.
- **`Service`** — name, durationMinutes, price, isActive, deactivatedAt. No parent. Soft-deleted via `isActive`.
- **`TimeSlot`** — startsAt, endsAt, serviceId (parent: `Service`), status (`available`/`held`/`booked`). Not independently soft-deleted; lifecycle is its status field.
- **`Appointment`** — serviceId (parent: `Service`), timeSlotId (parent: `TimeSlot`), customerName, customerPhone, status (`pending`/`confirmed`/`cancelled`/`completed`). Soft-deleted via `status: cancelled`.

---

## Out of Scope (v1)
- Customer accounts/login/booking history (guest-only booking for v1).
- Online payments (paid in person at the clinic).
- SMS/email appointment reminders.
- Multi-staff/multi-groomer scheduling (single implicit resource per slot).
- Recurring/repeat appointments.
- Customer-initiated rescheduling or cancellation (customer must contact the clinic directly).
- Design-fidelity acceptance criteria (no design source exists yet for v1 — the Frontend Agent designs the UI itself per `style-rules.md`).
