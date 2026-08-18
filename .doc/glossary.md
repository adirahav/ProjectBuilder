# Glossary

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

### `Service`
- **Canonical meaning:** A treatment the clinic offers (e.g. haircut, nail trim, spa), with a fixed duration and price.
- **Use:** Always `Service`, not `Treatment`, `Offering`, or `Product`. Hard rule.
- **Plural:** `Services`

⚠️ **Naming collision to be aware of:** `Service` (the domain entity) shares a word with the microservices themselves (`booking-service`, `user-service`, `notification-service`). In code/docs, a bare "service" in a backend-architecture context always means a microservice; the domain entity is always written `Service` (capitalized) or fully qualified as "a Service record"/"the Service model" to avoid ambiguity.

### `Appointment`
- **Canonical meaning:** A customer's confirmed or pending booking of a `Service` at a specific `TimeSlot`.
- **Use:** Always `Appointment`, not `Booking`, `Reservation`, or `Order`. Hard rule.
- **Plural:** `Appointments`

### `AppointmentStatus`
- **Canonical meaning:** The current state of an `Appointment` in its lifecycle.
- **Variants:**
  - `pending` — customer has requested it, awaiting admin confirmation (if confirmation is required) or awaiting the slot claim to finalize.
  - `confirmed` — the appointment is booked and the `TimeSlot` is locked to it.
  - `cancelled` — cancelled by the customer or the admin; the `TimeSlot` is released.
- **Use:** Always these exact lowercase values — no alternate casing, translations, or synonyms in code/API.

### `TimeSlot`
- **Canonical meaning:** A specific bookable date/time window for one `Service`. This is the contested/limited resource — two customers can race to claim the same `TimeSlot`, so its concurrency handling is governed by `seat-concurrency-layer`.
- **Use:** Always `TimeSlot` (one word, capital T and S), not `Slot`, `Time Slot`, or `Availability`. Hard rule.
- **Plural:** `TimeSlots`

### `TimeSlotStatus`
- **Canonical meaning:** The current state of a `TimeSlot` in its lifecycle.
- **Variants:**
  - `open` — available for booking.
  - `held` — transiently claimed while a customer completes the booking form (short-lived, prevents a race with another customer).
  - `booked` — locked to a confirmed `Appointment`.
- **Use:** Always these exact lowercase values — no alternate casing, translations, or synonyms in code/API.

### `book` (action)
- **Canonical meaning:** A customer claims an `open` `TimeSlot` and creates an `Appointment` for it.
- **Use:** Always `book`/`booking`, not `reserve` or `order`.

### `confirm` (action)
- **Canonical meaning:** The admin (or the system, if no manual approval step is required) finalizes a `pending` `Appointment`, moving it to `confirmed`.
- **Use:** Always `confirm`, not `approve` (product/UI copy may say "Approve" as a synonym for the same action — see role note below; API/code stays `confirm`).

### `cancel` (action)
- **Canonical meaning:** Either the customer or the admin cancels an `Appointment`, releasing its `TimeSlot` back to `open`.
- **Use:** Always `cancel`, not `delete` or `remove` — an `Appointment` is cancelled, never hard-deleted (see `database-rules` soft-delete conventions).

### `Customer`
- **Canonical meaning:** An anonymous, unregistered visitor who books an `Appointment`. Has no account.
- **Use:** Always `Customer` in code/API. No login flow exists for this role — do not introduce `User` as a synonym for `Customer`.

### `Admin`
- **Canonical meaning:** The clinic's business owner — the only authenticated role in this product. Manages `Service` records and all `Appointments`.
- **Use:** Always `Admin` in code/API; UI copy may say "Approve" for the `confirm` action, but the underlying concept is the same — never introduce a second admin-like role.

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md`.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.
