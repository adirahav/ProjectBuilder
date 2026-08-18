# PRD — ClinicBook

**Version:** 1.0
**Status:** In Development

---

## Overview
ClinicBook is a bilingual (Hebrew/English) appointment-booking web and native app for a small clinic or salon. Guest customers browse the service catalog, pick an open time slot, and confirm a booking without creating an account; the Admin (business owner) manages the service catalog and reviews, approves, or cancels appointments from a dashboard.

---

## Screens

### Screen 1 — Service List (Customer, public)
- Grid/list of active Services, each showing name, duration, and price
- Language toggle (Hebrew/English) affecting layout direction (RTL/LTR)
- Tapping/clicking a Service opens Screen 2
- Empty state if no active Services exist

### Screen 2 — Time Slot Picker (Customer, public)
- Selected Service's name, duration, and price shown at top
- Date picker (defaults to today/next available day)
- Grid of TimeSlots for the selected date, each showing start time
- TimeSlots already `booked`/`pending`/`blocked` are visibly disabled, not just omitted — status must never be conveyed by color alone (see `accessibility-layer` skill)
- Selecting an available TimeSlot opens Screen 3
- If a slot the customer is looking at gets taken by someone else while they're on this screen, the UI reflects the change (re-fetch or optimistic-locking conflict message) rather than allowing a stale selection

### Screen 3 — Booking Details Form (Customer, public)
- Summary of chosen Service + TimeSlot
- Form fields: full name, phone number, email (optional), notes (optional)
- Submit button — "Confirm Appointment"
- Client-side validation (required fields, phone/email format) before submit
- On submit conflict (slot taken between selection and submit), shows a clear error and returns the customer to Screen 2 with fresh availability

### Screen 4 — Booking Confirmation (Customer, public)
- Confirmation message with Service, date/time, and a reference/confirmation number
- Appointment status shown as "pending admin approval" (not yet a guaranteed final booking)
- No further action required; no account created

### Screen 5 — Admin Login
- Email/username + password fields
- Submit calls the auth endpoint; on success stores JWT and routes to Screen 6
- Error state for invalid credentials

### Screen 6 — Admin Dashboard: Appointments (Admin, authenticated)
- Tabs/filters by `AppointmentStatus`: pending, approved, cancelled, completed
- List of Appointments with customer name, Service, date/time, status
- Status shown with icon + text, never color alone (see `accessibility-layer` skill)
- Per-row actions: Approve (pending → approved), Cancel (any non-terminal → cancelled)
- Clicking a row expands/opens full appointment detail (customer contact info, notes)

### Screen 7 — Admin Dashboard: Services (Admin, authenticated)
- List of all Services (active and inactive) with name, duration, price, active/inactive toggle
- "Add Service" opens a form (name, duration, price)
- Edit existing Service (same form, pre-filled)
- Deactivate toggle (soft delete — `isActive: false`, never a hard delete since past Appointments reference it)

### Screen 8 — Admin Dashboard: Time Slots (Admin, authenticated)
- Calendar/list view of TimeSlots per day, grouped by Service
- Admin can create new TimeSlots (single or bulk/recurring) for a Service
- Admin can block a TimeSlot (e.g. lunch break) — `available` → `blocked`
- Admin can unblock a TimeSlot — `blocked` → `available`
- Slots already tied to an Appointment cannot be edited/deleted directly — must cancel the Appointment first

---

## Functional Requirements

| ID | Requirement | API Route / Service |
|----|---|---|
| F1 | Customer can list active Services | `GET /api/services` (`catalog-service`, via `api-gateway`) |
| F2 | Customer can list available TimeSlots for a Service and date | `GET /api/timeslots?serviceId=:id&date=:date` (`appointment-service`) |
| F3 | Customer can book an Appointment for a TimeSlot | `POST /api/appointments` (`appointment-service`) |
| F4 | Booking a contested TimeSlot resolves correctly under concurrent requests | `POST /api/appointments` (`appointment-service`, atomic status guard) |
| F5 | Customer sees a confirmation after booking | client-side render of `POST /api/appointments` response |
| F6 | Admin can log in | `POST /api/auth/login` (`user-management-service`, via `api-gateway`) |
| F7 | Admin can list Appointments, filterable by status | `GET /api/appointments?status=:status` (`appointment-service`) |
| F8 | Admin can approve a pending Appointment | `PATCH /api/appointments/:id/approve` (`appointment-service`) |
| F9 | Admin can cancel an Appointment | `PATCH /api/appointments/:id/cancel` (`appointment-service`) |
| F10 | Admin can create a Service | `POST /api/services` (`catalog-service`) |
| F11 | Admin can edit a Service | `PATCH /api/services/:id` (`catalog-service`) |
| F12 | Admin can deactivate a Service (soft delete) | `PATCH /api/services/:id` (`isActive: false`) (`catalog-service`) |
| F13 | Admin can create TimeSlots for a Service | `POST /api/timeslots` (`appointment-service`) |
| F14 | Admin can block/unblock a TimeSlot | `PATCH /api/timeslots/:id/block`, `PATCH /api/timeslots/:id/unblock` (`appointment-service`) |
| F15 | Admin actions require a valid JWT; customer actions require none | `api-gateway` JWT verification + `x-user-id`/`x-user-role` header injection |

---

## Non-Functional Requirements
- UI must support Hebrew (primary, RTL) and English (secondary, LTR) with layout using logical CSS properties, not hardcoded left/right — see `css-layer` skill
- Mobile-first responsive layout; must also run as a native Capacitor app on Android/iOS — see `native-navigation-layer` skill
- WCAG AA accessibility target; `AppointmentStatus`/`TimeSlotStatus` must never be conveyed by color alone — see `accessibility-layer` skill
- TimeSlot booking must resolve concurrent requests deterministically (exactly one succeeds) — see `seat-concurrency-layer` skill and `database-rules.md`
- Admin routes require a valid JWT verified at `api-gateway`; downstream services trust `x-user-id`/`x-user-role` headers only and must not be reachable directly from the internet in production
- Customer-facing routes require no authentication whatsoever
- `Service` uses soft delete (`isActive` flag); `Appointment`/`TimeSlot` use status-based lifecycles, never hard-deleted — see `database-rules.md`
- No real-time push/websocket requirement for v1 — availability is refreshed via re-fetch, not live sync

---

## Acceptance Criteria
- **AC-1:** Customer can complete Service → TimeSlot → Details → Confirmation without any login prompt at any step.
- **AC-2:** When two customers attempt to book the same TimeSlot simultaneously, exactly one `POST /api/appointments` succeeds; the other receives a conflict response and sees updated availability.
- **AC-3:** A deactivated Service (`isActive: false`) no longer appears in the customer-facing Service list but still appears correctly on any historical Appointment that referenced it.
- **AC-4:** A cancelled Appointment releases its TimeSlot back to `available` immediately.
- **AC-5:** Admin cannot access any dashboard route without a valid JWT; an expired/missing/invalid token redirects to Screen 5 (Login).
- **AC-6:** Customer cannot access any Admin-only route or action under any circumstance (no customer login exists).
- **AC-7:** `AppointmentStatus` and `TimeSlotStatus` are always shown with both an icon/label and text — never color alone — on both the customer confirmation screen and the Admin dashboard.
- **AC-8:** The full booking flow and the Admin dashboard render correctly and are fully usable in both Hebrew (RTL) and English (LTR).
- **AC-9:** The native Android/iOS build supports the full customer booking flow and Admin dashboard, including correct hardware back-button behavior at each step (see `native-navigation-layer` skill).

---

## Data Model
See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.
- **Service** — name, duration (minutes), price, `isActive` (soft delete). No parent.
- **TimeSlot** — service reference, start time, end time, `status` (`available`/`held`/`booked`/`blocked`). Belongs to a Service.
- **Appointment** — service reference, timeSlot reference, customer name/phone/email, notes, `status` (`pending`/`approved`/`cancelled`/`completed`). References a Service and a TimeSlot.

---

## Out of Scope (v1)
- Customer accounts/login/booking history (guest-only)
- Multi-tier admin roles or staff permissions
- Payments/deposits at booking time
- SMS/email reminder automation
- Multi-location/multi-branch support
- Recurring/repeat appointments
- Design-source fidelity checks (no external design source for this project — Frontend Agent designs per `style-rules.md`)
