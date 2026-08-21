# PRD — Dog Grooming Appointment Booking System

**Version:** 1.0
**Status:** In Development

---

## Overview
A self-service appointment-booking system for a small, single-groomer dog-grooming clinic. Anonymous customers browse published services, pick an open time slot, and book it with just their contact details — no account needed. The clinic's single Admin manages the service list and the full appointment schedule from an authenticated dashboard, replacing phone-and-paper scheduling.

---

## Screens

### Screen 1 — Service List (public, Customer)
- Lists all active `Service` records: name, duration, price.
- Each service has a "Book" action that starts the booking flow for that service.
- Hebrew/English toggle, RTL by default.

### Screen 2 — Time Slot Picker (public, Customer)
- Date picker plus a list/grid of `TimeSlot`s for the selected `Service` and date, showing only `open` slots.
- Selecting a slot attempts to atomically hold it (`open` → `held`); if another customer already claimed it, show a clear "no longer available" message and refresh the list — see `seat-concurrency-layer`.
- Slot status must never be conveyed by color alone (e.g. disabled/booked slots also carry a text label or icon) — see `accessibility-layer`.

### Screen 3 — Customer Details Form (public, Customer)
- Fields: name (required), phone (required), email (optional).
- Submitting creates the `Appointment` and finalizes the held `TimeSlot` to `booked`.
- Shows a countdown/expiry notice while the slot is held, since the hold is short-lived.

### Screen 4 — Booking Confirmation (public, Customer)
- Summary of the booked `Appointment`: service, date/time, price, contact details entered.
- No login, no account — this screen (or a confirmation reference) is the only receipt the customer gets.

### Screen 5 — Admin Login
- Email/username + password form for the single Admin account.
- On success, stores the issued JWT and redirects to the Admin dashboard.

### Screen 6 — Admin Dashboard: Services (authenticated, Admin)
- List of all `Service` records (including inactive ones), with create/edit/deactivate actions.
- Create/edit form: name, duration, price, active toggle.
- Deactivating a service is a soft delete — it disappears from the public Screen 1 but stays in Admin's list.

### Screen 7 — Admin Dashboard: Appointments (authenticated, Admin)
- Calendar or list view of all `Appointment`s, filterable by date and status (`pending`/`confirmed`/`cancelled`).
- Status is shown with both a label and an icon/shape (not color alone) — see `accessibility-layer`.
- Per-appointment actions: confirm (`pending` → `confirmed`) and cancel (`confirmed`/`pending` → `cancelled`, releases the `TimeSlot` back to `open`).

### Screen 8 — Admin Dashboard: Staff Accounts (authenticated, Admin)
- Lets an already-logged-in Admin create an additional Admin/staff account (name, email/username, password).
- **Not a public route** — there is no self-service Signup surface anywhere in the app; this screen only exists inside the authenticated Admin dashboard, reachable from Screen 6/7's navigation. Creating this route as an unauthenticated/public page is a security regression (open self-registration into an Admin-privileged account) and must be rejected in review.
- New accounts created here have the same Admin privileges as the seeded account — no separate roles/permission tiers in v1.
- No self-signup, no "forgot password"/invite-link flow in v1 — an existing Admin creates the account directly and shares the credentials out of band.

---

## Functional Requirements

| ID | Requirement | API Route / Service |
|----|---|---|
| F1 | Customer can list active services | `GET /api/services` (`booking-service`) |
| F2 | Customer can list open time slots for a service and date | `GET /api/time-slots?serviceId=&date=` (`booking-service`) |
| F3 | Customer can atomically hold an open time slot | `POST /api/time-slots/:id/hold` (`booking-service`) |
| F3b | A held slot's hold expires automatically if not booked in time | internal to `booking-service` (scheduled/lazy expiry check) |
| F4 | Customer can submit contact details to create an appointment for a held slot | `POST /api/appointments` (`booking-service`) |
| F4b | Booking triggers a confirmation notification | server-to-server call, `booking-service` → `notification-service` |
| F5 | Admin can log in | `POST /api/auth/login` (`user-service`, via `api-gateway`) |
| F6 | Admin can create a service | `POST /api/services` (`booking-service`, via `api-gateway`) |
| F7 | Admin can edit a service | `PATCH /api/services/:id` (`booking-service`, via `api-gateway`) |
| F8 | Admin can deactivate a service (soft delete) | `PATCH /api/services/:id/deactivate` (`booking-service`, via `api-gateway`) |
| F9 | Admin can list all appointments | `GET /api/appointments` (`booking-service`, via `api-gateway`) |
| F10 | Admin can confirm a pending appointment | `PATCH /api/appointments/:id/confirm` (`booking-service`, via `api-gateway`) |
| F11 | Admin can cancel an appointment | `PATCH /api/appointments/:id/cancel` (`booking-service`, via `api-gateway`) |
| F12 | An authenticated Admin can create a new Admin/staff account | `POST /api/auth/register` (`user-service`, via `api-gateway`) — **must itself require a valid Admin JWT**, same as any other Admin route |

---

## Non-Functional Requirements
- Hebrew (default, RTL) and English (LTR) supported throughout; UI uses logical CSS properties, not hardcoded left/right — see `css-layer`.
- Web and native (Capacitor/Android/iOS) targets from the same codebase; native handles back-button/navigation-stack behavior — see `native-navigation-layer`.
- No real-time sync requirement beyond re-fetching the slot list on hold conflict (no websockets in v1).
- Responsive layout required for both the public booking flow (mobile-first, since customers likely book from a phone) and the Admin dashboard (desktop-first, tablet-usable).
- Accessibility target: WCAG AA — see `accessibility-layer`.
- Auth: all Admin routes require a valid JWT verified by `api-gateway`; all public booking routes are unauthenticated by design.
- `TimeSlot` is the source of truth for booking availability; a slot must never be `booked` twice — see `seat-concurrency-layer` and `database-rules`.
- Deletion model: soft delete throughout (`Service.isActive`, `Appointment.status = cancelled`) — nothing is hard-deleted in v1.

---

## Acceptance Criteria
- **AC-1:** A customer can view active services, pick an open slot, submit contact details, and land on a confirmation screen showing the correct service/date/time/price. (F1-F4)
- **AC-2:** When two customers attempt to hold the same `TimeSlot` at the same time, exactly one hold succeeds; the other sees an "unavailable" message and the slot list refreshes to no longer show that slot as open. (F3)
- **AC-3:** A held slot that is never completed reverts to `open` after its hold expiry, and becomes bookable by another customer again. (F3b)
- **AC-4:** A deactivated `Service` no longer appears on the public Service List (Screen 1) but still appears in the Admin's Services list. (F8)
- **AC-5:** A cancelled `Appointment` releases its `TimeSlot` back to `open`, immediately bookable by another customer. (F11)
- **AC-6:** Appointment status (`pending`/`confirmed`/`cancelled`) is always shown with a text label and/or icon in the Admin dashboard, never conveyed by color alone. (Screen 7, accessibility)
- **AC-7:** The Admin dashboard is unreachable without a valid JWT — an unauthenticated request to any Admin route returns a 401 and the frontend redirects to Admin Login. (F5, F6-F11)
- **AC-8:** The full booking flow and Admin dashboard render correctly in both Hebrew (RTL) and English (LTR), with no mirrored-icon or broken-layout regressions.
- **AC-9:** The native (Capacitor) build renders the same booking flow and Admin dashboard functionally identically to web, including correct back-button behavior on each screen.
- **AC-10:** An authenticated Admin can create a new Admin/staff account from Screen 8, and can immediately log in with it. The account-creation route rejects any request without a valid Admin JWT (401), and no unauthenticated Signup page exists anywhere in the app. (F12, Screen 8)

---

## Data Model
See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.
- **Service** — name, duration, price, isActive (soft delete flag). No parent.
- **TimeSlot** — service (ref), date/time window, status (`open`/`held`/`booked`). Belongs to a `Service`.
- **Appointment** — service (ref), timeSlot (ref), customer contact details (name, phone, email), status (`pending`/`confirmed`/`cancelled`). References both `Service` and `TimeSlot`; cancellation is a status change, not a hard delete.

---

## Out of Scope (v1)
- Multiple staff members / multiple simultaneous groomers.
- Multi-location support.
- Online payment at booking time.
- Automated SMS reminders beyond a basic booking confirmation (email/SMS provider TBD).
- Customer accounts / booking history / self-registration — customers never create an account or log in. (This does not apply to Screen 8's Admin/staff account creation, which is an authenticated-Admin-only action, not customer self-signup.)
- Recurring/repeat appointments.
