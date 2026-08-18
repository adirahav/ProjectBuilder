# Glossary

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

### `Service`
- **Canonical meaning:** A grooming treatment the clinic offers (e.g. haircut, nail trim, spa bath), with a name, `durationMinutes`, and `price`.
- **Use:** Always `Service`, not `Treatment`, `Product`, or `Offering`. Hard rule — `Treatment`/`Product` must never appear in code, routes, or copy.
- **Plural:** `Services`

### `Appointment`
- **Canonical meaning:** A customer's confirmed-or-pending booking of one `Service` at one `TimeSlot`, including the customer's contact details captured at booking time.
- **Use:** Always `Appointment`, not `Booking`, `Reservation`, or `Order`. Hard rule.
- **Plural:** `Appointments`

### `AppointmentStatus`
- **Canonical meaning:** The current state of an `Appointment` in its lifecycle.
- **Variants:**
  - `pending` — created by a customer booking; awaiting admin confirmation.
  - `confirmed` — admin has confirmed the appointment will happen.
  - `cancelled` — admin (or the system, on expiry) cancelled the appointment; the held `TimeSlot` is released back to `available`.
  - `completed` — the appointment's time has passed and the service was delivered.
- **Use:** Always these exact lowercase values — no alternate casing, translations, or synonyms.

### `TimeSlot`
- **Canonical meaning:** A single bookable unit of time for the clinic (start/end timestamp) — the contested/limited resource of this system. At most one `Appointment` may hold a given `TimeSlot` at a time.
- **Use:** Always `TimeSlot`, not `Slot` alone, `Seat` (the term used in the reference project this template derives from), or `Availability`. Hard rule — `Seat` must not appear anywhere in this codebase.
- **Plural:** `TimeSlots`

### `TimeSlotStatus`
- **Canonical meaning:** The current state of a `TimeSlot` in the concurrency-safe claim lifecycle (see `seat-concurrency-layer` skill, adapted for TimeSlot).
- **Variants:**
  - `available` — open for booking; no `Appointment` currently holds it.
  - `held` — momentarily reserved during an in-progress booking transaction, before the `Appointment` record is committed. Prevents a second customer from claiming it mid-transaction.
  - `booked` — committed to a `pending` or `confirmed` `Appointment`.
- **Use:** Always these exact lowercase values everywhere — UI, API payloads, and DB. When an `Appointment` is cancelled, its `TimeSlot` transitions back to `available`.

⚠️ **Naming collision to be aware of:** `TimeSlot` (the bookable time unit / contested resource) is not the same concept as a `Service`'s `durationMinutes` (how long a service takes). A `TimeSlot`'s length is derived from the `Service` selected when it's created/held, but the two are separate entities — never conflate "slot duration" with "service duration" in code or docs.

---

## Roles

### `Admin`
- **Canonical meaning:** The clinic owner/business operator. Authenticated via `user-service`; manages `Service` records and reviews/confirms/cancels `Appointment`s.
- **Use:** Always `Admin` in code/API. Product-facing UI copy may say "clinic owner" or "business owner" but must refer to the exact same role — never introduce a second, distinct "owner" or "manager" role.

### `Customer`
- **Canonical meaning:** A dog owner booking an appointment. Unauthenticated/guest in v1 — no account or login. Identified at booking time by name and phone number captured on the `Appointment` record.
- **Use:** Always `Customer` in code/API, not `Guest`, `User`, or `Client`. Hard rule — `User` is reserved for internal/generic auth-account language in `user-service` and must not be used to mean `Customer`.

⚠️ **Naming collision to be aware of:** `user-service` (the backend service name, which owns `Admin` accounts and auth) is not the same as `Customer`. `user-service` never stores a `Customer` as an authenticated account — `Customer` data lives only on the `Appointment` record it was captured with. Never call a `Customer` a "user" in code or docs.

---

## Action Verbs

### `book`
- **Canonical meaning:** A `Customer` claims a `TimeSlot` for a chosen `Service` and submits their contact details, creating a `pending` `Appointment`.
- **Use:** Always `book`/`booking`, not `reserve`, `order`, or `schedule`.

### `hold`
- **Canonical meaning:** The system momentarily marks a `TimeSlot` as `held` during the in-progress booking transaction, before the `Appointment` is committed — prevents a race between two simultaneous booking attempts. See `seat-concurrency-layer` skill.
- **Use:** Always `hold`/`held`, not `lock` or `reserve`.

### `confirm`
- **Canonical meaning:** `Admin` marks a `pending` `Appointment` as `confirmed`.
- **Use:** Always `confirm`, not `approve`.

### `cancel`
- **Canonical meaning:** `Admin` (or the system, on hold expiry) cancels an `Appointment`, releasing its `TimeSlot` back to `available`.
- **Use:** Always `cancel`, not `reject` or `delete`. `Appointment`s are soft-deleted/status-transitioned, never hard-deleted — see `database-rules.md`.

### `complete`
- **Canonical meaning:** The system or `Admin` marks a `confirmed` `Appointment` as `completed` once its time has passed and the service was delivered.
- **Use:** Always `complete`, not `finish` or `close`.

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md`.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.
