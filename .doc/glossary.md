# Glossary

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

### `Service`
- **Canonical meaning:** A treatment/offering the clinic or salon provides (e.g. "Haircut", "Manicure"), with a name, duration, and price. Owned by `catalog-service`.
- **Use:** Always `Service`, not `Treatment`, `Product`, or `Offering`. Hard rule — matches the API resource and DB collection name.
- **Plural:** `Services`

### `Appointment`
- **Canonical meaning:** A customer's confirmed or pending booking of a Service at a specific TimeSlot. Owned by `appointment-service`.
- **Use:** Always `Appointment`, not `Booking`, `Reservation`, or `Order`. Hard rule.
- **Plural:** `Appointments`

### `AppointmentStatus`
- **Canonical meaning:** The current state of an `Appointment` in its lifecycle.
- **Variants:**
  - `pending` — customer has booked the slot; awaiting admin approval
  - `approved` — admin has confirmed the appointment
  - `cancelled` — cancelled by the admin or the customer before the appointment time
  - `completed` — the appointment time has passed and it was fulfilled
- **Use:** Always these exact lower-case values — no alternate casing, translations, or synonyms in code/API/DB.

### `TimeSlot`
- **Canonical meaning:** A single bookable unit of time for a given Service (or the admin's general availability), the contested resource of this system — only one Appointment can ever hold a given TimeSlot. Owned by `appointment-service`.
- **Use:** Always `TimeSlot`, not `Slot` alone, `Seat`, or `Booking Window`. Hard rule — this is the renamed concept from the reference project's "Seat".
- **Plural:** `TimeSlots`

### `TimeSlotStatus`
- **Canonical meaning:** The current state of a `TimeSlot` in its lifecycle.
- **Variants:**
  - `available` — open for booking
  - `held` — a customer has started booking it (short-lived optimistic hold during checkout, if used) or it is `pending` on an Appointment
  - `booked` — attached to an `approved` or `pending` Appointment
  - `blocked` — admin has manually removed it from availability (e.g. lunch break, day off)
- **Use:** Always these exact lower-case values — no alternate casing, translations, or synonyms.

### `approve`
- **Canonical meaning:** Admin action that moves an `Appointment` from `pending` to `approved`.
- **Use:** Always `approve`/`approved`, not `confirm`/`confirmed`.

### `cancel`
- **Canonical meaning:** Admin or customer action that moves an `Appointment` to `cancelled` and releases its `TimeSlot` back to `available`.
- **Use:** Always `cancel`/`cancelled`, not `reject`/`decline`/`delete`.

### `book`
- **Canonical meaning:** Customer action that claims an available `TimeSlot` for a chosen `Service`, creating a `pending` `Appointment`.
- **Use:** Always `book`/`booking` (as a verb/gerund describing the action), not `reserve`/`order`. Note: `Appointment` (not "Booking") remains the canonical noun for the resulting entity — "booking" is only used as the verb describing the act of creating one.

### `Customer`
- **Canonical meaning:** A guest, unauthenticated end user who browses Services and books Appointments. Has no account or login.
- **Use:** Always `Customer` in code/API; UI copy may say "you" in customer-facing flows, but never introduces a different role name.

### `Admin`
- **Canonical meaning:** The authenticated business owner/staff role who manages Services and Appointments via the dashboard. Single-tier — no distinct sub-roles in v1.
- **Use:** Always `Admin` in code/API; product-facing UI copy may say "business owner" or "you" in admin-only screens, but these all refer to the same single role, never a separate concept.

⚠️ **Naming collision to be aware of:** `user-management-service` exists only to authenticate `Admin` — it does not manage `Customer` records (customers are guests with no account). Do not use the generic word "user" to mean `Customer` anywhere in code, docs, or API routes; "user" in this codebase always means `Admin`.

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md`.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.
