# PRD — BookMe

**Version:** 1.0
**Status:** In Development

---

## Overview
BookMe lets customers of a small clinic/salon browse services, pick an available time, and book an appointment themselves — no account required. The business owner (Admin) manages the service catalog and every appointment (approve, cancel, reschedule) from a single dashboard, replacing manual scheduling by phone or WhatsApp.

---

## Screens

### Screen 1 — Services List
- Public, unauthenticated. First screen a customer sees.
- Lists every active `Service`: name, duration, price.
- Each `Service` is a card/row with a "Book" action.
- Selecting a `Service` navigates to the TimeSlot Picker for that service.

### Screen 2 — TimeSlot Picker
- Public, unauthenticated. Scoped to the `Service` selected on Screen 1.
- Date selector (defaults to the next available day).
- Grid/list of `TimeSlots` for the selected date, each showing its `TimeSlotStatus` visually — status must never be conveyed by color alone (see `accessibility-layer` skill); pair color with a label/icon (e.g. "Available" vs. "Booked").
- Only `available` `TimeSlots` are selectable.
- Selecting a `TimeSlot` briefly holds it (`available → held`) and navigates to the Booking Form.

### Screen 3 — Booking Form
- Public, unauthenticated.
- Shows the selected `Service` and `TimeSlot` as a summary (read-only).
- Fields: customer name (required), phone or email (at least one required).
- Submit creates the `Appointment` in `pending` status and moves the `TimeSlot` to `booked`.
- If the hold on the `TimeSlot` expired before submit, show an error and return to the TimeSlot Picker.

### Screen 4 — Booking Confirmation
- Public, unauthenticated.
- Shows the confirmed booking summary (service, date/time, status = `pending`, meaning "awaiting business confirmation").
- States that a confirmation email will follow.

### Screen 5 — Admin Login
- Username/password form.
- On success, issues a JWT and redirects to the Admin Appointments Dashboard.

### Screen 6 — Admin Services Management
- Authenticated (Admin only).
- Lists all `Services` (including soft-deleted, visually distinguished — see `accessibility-layer` skill for non-color-only treatment).
- Create/edit a `Service`: name, duration, price.
- Deactivate (soft-delete) a `Service`; deactivated services no longer appear on Screen 1.

### Screen 7 — Admin Appointments Dashboard
- Authenticated (Admin only). Default landing screen after login.
- Lists all `Appointments`, filterable by `AppointmentStatus` (`pending`/`confirmed`/`completed`/`cancelled`).
- Each row shows customer name, contact info, `Service`, `TimeSlot`, and status — status shown with a label/icon in addition to color.
- Actions per row: **Approve** (`pending → confirmed`), **Cancel** (`any → cancelled`, releases the `TimeSlot`), **Reschedule** (opens a `TimeSlot` picker scoped to the same `Service`, moves the `Appointment` to the new slot and releases the old one).

---

## Functional Requirements

| ID  | Requirement | API Route / Service |
|-----|---|---|
| F1  | Customer can list all active Services | `GET /api/services` (`booking-service`) |
| F2  | Customer can list available TimeSlots for a Service on a date | `GET /api/services/:id/timeslots?date=` (`booking-service`) |
| F3  | Customer can hold a TimeSlot when starting a booking | `POST /api/timeslots/:id/hold` (`booking-service`) |
| F4  | Customer can submit a booking (name + phone/email) to create an Appointment | `POST /api/appointments` (`booking-service`) |
| F5  | Admin can log in and receive a JWT | `POST /api/auth/login` (`admin-service`) |
| F6  | Admin can create/edit a Service | `POST /api/services`, `PATCH /api/services/:id` (`booking-service`, admin-scoped) |
| F7  | Admin can deactivate (soft-delete) a Service | `DELETE /api/services/:id` (`booking-service`, admin-scoped) |
| F8  | Admin can list all Appointments, filterable by status | `GET /api/admin/appointments?status=` (`booking-service`, admin-scoped) |
| F9  | Admin can approve a pending Appointment | `PATCH /api/admin/appointments/:id/approve` (`booking-service`, admin-scoped) |
| F10 | Admin can cancel an Appointment | `PATCH /api/admin/appointments/:id/cancel` (`booking-service`, admin-scoped) |
| F11 | Admin can reschedule an Appointment to a different TimeSlot | `PATCH /api/admin/appointments/:id/reschedule` (`booking-service`, admin-scoped) |
| F12 | Customer receives a confirmation email after booking | Triggered by F4, async (`booking-service`) |

---

## Non-Functional Requirements
- Hebrew, RTL, single-language for v1 — see `css-layer` and `accessibility-layer` skills for RTL-aware layout.
- Responsive/mobile-first — customers are expected to book primarily from phones.
- Web only for v1 — no native app (`native-navigation-layer` skill deleted for this project).
- Accessibility target: WCAG AA. `AppointmentStatus` and `TimeSlotStatus` must never be conveyed by color alone (see `accessibility-layer` skill).
- Admin-scoped routes require a valid JWT with `role: admin`; public routes require no auth — see `.rule/database-rules.md` and `jwt-middleware-layer` skill.
- `TimeSlot` is the source-of-truth contested entity: exactly one `Appointment` may hold/book a given `TimeSlot` at a time, enforced atomically in `booking-service` — see `seat-concurrency-layer` skill.
- Deletion model: soft delete (`deletedAt`) for `Service`; soft-deleted `Services` are excluded from Screen 1 and F1 but remain visible (marked) in Screen 6 — see `.rule/database-rules.md`.

---

## Acceptance Criteria
- **AC-1:** A customer can complete the full happy path — browse Services (F1), pick a TimeSlot (F2), submit the Booking Form (F4) — and land on the Booking Confirmation screen with the Appointment in `pending` status.
- **AC-2:** When two customers attempt to hold/book the same `TimeSlot` at the same instant, exactly one request succeeds and the other receives a clear "no longer available" response — the `TimeSlot` never ends up double-booked.
- **AC-3:** An Admin can log in (F5) and is redirected to the Appointments Dashboard (Screen 7) with a valid JWT that grants access to admin-scoped routes (F6-F11) and is rejected on public-only calls without it.
- **AC-4:** Approving an Appointment (F9) transitions it from `pending` to `confirmed` and this is reflected immediately in the dashboard list.
- **AC-5:** Cancelling an Appointment (F10) transitions it to `cancelled` and releases its `TimeSlot` back to `available`, making it bookable again by another customer.
- **AC-6:** Rescheduling an Appointment (F11) releases the original `TimeSlot` (back to `available`) and holds/books the new one atomically — no window where both slots are simultaneously held by the same Appointment.
- **AC-7:** Deactivating a Service (F7) removes it from the public Services List (F1) immediately but it remains visible, marked as inactive, in the Admin Services Management screen — soft-delete, not a hard removal.
- **AC-8:** `AppointmentStatus` and `TimeSlotStatus` are always shown with a text label or icon in addition to color across Screens 2 and 7.
- **AC-9:** All customer-facing and admin-facing screens render correctly in RTL Hebrew, including form inputs, date pickers, and status indicators.

---

## Data Model
See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.
- **Service** — name, durationMinutes, price, isActive; soft-deleted (`deletedAt`)
- **TimeSlot** — service (parent: Service), date, startTime, status (`available`/`held`/`booked`); not independently soft-deleted (lifecycle tracked via status)
- **Appointment** — service (parent: Service), timeSlot (parent: TimeSlot), customerName, customerPhone/customerEmail, status (`pending`/`confirmed`/`completed`/`cancelled`); soft-deleted (`deletedAt`)
- **Admin** — username, passwordHash; single record for v1 (no multi-admin)

---

## Out of Scope (v1)
- Customer accounts/login — anonymous booking only
- Online payment at booking time — payment happens in person
- Multi-business / multi-location support
- Native mobile app
- Multi-language / translation beyond Hebrew
- Staff/employee-level scheduling (multiple staff per service)
- SMS notifications — email only for v1
