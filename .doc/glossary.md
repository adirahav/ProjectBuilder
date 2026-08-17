# Glossary

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

### `Service`
- **Canonical meaning:** A bookable offering the business provides (e.g. haircut, facial treatment), with a name, duration, and price.
- **Use:** Always `Service`, not `Treatment`, `Offering`, or `Item`. Hard rule.
- **Plural:** `Services`

⚠️ **Naming collision to be aware of:** the domain entity `Service` is unrelated to the microservices `booking-service` and `admin-service`. In code/docs, always write the microservice name with its full hyphenated suffix (`booking-service`, `admin-service`) and never shorten a microservice reference to bare "service" where a domain `Service` could also be meant — spell out which one is intended.

### `Appointment`
- **Canonical meaning:** A customer's booking of a specific `Service` at a specific `TimeSlot`, with the customer's contact details attached.
- **Use:** Always `Appointment`, not `Booking`, `Order`, or `Reservation`. Hard rule.
- **Plural:** `Appointments`

### `AppointmentStatus`
- **Canonical meaning:** The current state of an `Appointment` in its lifecycle.
- **Variants:**
  - `pending` — created, awaiting admin approval
  - `confirmed` — approved by admin, appointment is scheduled
  - `completed` — the appointment time has passed and the service was delivered
  - `cancelled` — cancelled by admin or customer before it occurred
- **Use:** Always these exact lowercase values — no alternate casing, translations, or synonyms.

### `TimeSlot`
- **Canonical meaning:** A discrete, bookable window of time on a given day. The contested/limited resource of this system — exactly one `Appointment` may hold a given `TimeSlot` at a time.
- **Use:** Always `TimeSlot`, not `Slot` alone, `Window`, or `Timeslot` (no inner capital drop). Hard rule.
- **Plural:** `TimeSlots`

### `TimeSlotStatus`
- **Canonical meaning:** The current state of a `TimeSlot`.
- **Variants:**
  - `available` — open for booking
  - `held` — momentarily reserved during an in-progress booking attempt, per `seat-concurrency-layer`, before the appointment is confirmed
  - `booked` — claimed by a confirmed or pending `Appointment`
- **Use:** Always these exact lowercase values — no alternate casing, translations, or synonyms.

### `book`
- **Canonical meaning:** A customer claims a `TimeSlot` for a `Service`, creating an `Appointment` in `pending` status.
- **Use:** Always `book`/`booking` for the customer-facing action, not `reserve` or `order`.

### `approve`
- **Canonical meaning:** The admin transitions an `Appointment` from `pending` to `confirmed`.
- **Use:** Always `approve`, not `accept` or `confirm` as a verb (reserve "confirm" for the resulting status name only).

### `cancel`
- **Canonical meaning:** The admin or customer transitions an `Appointment` to `cancelled`, releasing its `TimeSlot` back to `available`.
- **Use:** Always `cancel`, not `reject` or `delete`.

### `reschedule`
- **Canonical meaning:** The admin moves an existing `Appointment` to a different `TimeSlot`, releasing the old slot and holding/booking the new one.
- **Use:** Always `reschedule`, not `move` or `change`.

### `Admin`
- **Canonical meaning:** The business owner. Manages the `Service` catalog and every `Appointment` (approve/cancel/reschedule). Single admin role for v1 — no multi-admin/staff distinction.
- **Use:** Always `Admin` in code/API; UI copy may say "Business Owner" but it refers to the same role.

### `Customer`
- **Canonical meaning:** An anonymous end user who browses `Services` and `TimeSlots` and books an `Appointment` by supplying name + phone/email. Never has an account or login.
- **Use:** Always `Customer` in code/API, not `User` or `Client` — `User` is avoided entirely as a term in this system to prevent confusion with generic auth-system language, since `Customer` never authenticates.

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md`.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.
