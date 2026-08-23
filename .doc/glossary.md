# Glossary

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

### `tour`
- **Canonical meaning:** A single scheduled trip an admin creates, with a name, date, and description, that one or more buses belong to.
- **Use:** Always `tour`, not `trip`, `event`, or `journey`. Hard rule.
- **Plural:** `tours`

### `bus`
- **Canonical meaning:** A vehicle belonging to a tour, with a seat layout, door position, driver side, and its own list of pickup points.
- **Use:** Always `bus`, not `vehicle` or `coach`. Hard rule.
- **Plural:** `buses`

### `busType`
- **Canonical meaning:** A reusable seat-grid template (rows, door row position, back-row seat count, manually blocked seats) independent of any specific tour or bus, used to create a new bus without defining its layout from scratch.
- **Use:** Always `busType` in code/API, "bus type" or "bus-type template" in prose. Not `busTemplate`, `seatTemplate`, or `layoutTemplate`. Hard rule.
- **Plural:** `busTypes`

### `seat`
- **Canonical meaning:** A single seat position on a bus, carrying both its position/layout data and (when occupied or requested) the passenger's identity — there is no separate passenger record.
- **Use:** Always `seat`, not `booking` or `reservation` as the entity name (`reservation`/`reserved` remains valid only as the status value, see `seatStatus` below). Hard rule.
- **Plural:** `seats`

### `seatStatus`
- **Canonical meaning:** The current state of a `seat` in its lifecycle.
- **Variants:**
  - `available` — open, no request against it.
  - `pending` — a passenger has requested it; awaiting admin approval.
  - `taken` — approved and confirmed for a passenger.
  - `reserved` — held by an admin outside the normal passenger request flow (manual admin reservation).
- **Use:** Always these exact lowercase values — no alternate casing, translations, or synonyms (e.g. never `confirmed` for `taken`, never `held` for `reserved`).

### `admin`
- **Canonical meaning:** An authenticated user record with `username`, `email`, `passwordHash`, and a `roles` array; the only entity with login credentials.
- **Use:** Always `admin` for the entity/collection name. See the `admin` role entry below for the permission meaning — the two must stay in sync (an `admin` entity only has administrative power once `"admin"` is in its `roles` array; see the naming-collision callout under `role: admin` below).
- **Plural:** `admins`

### `pickupPoint`
- **Canonical meaning:** A named, ordered stop on a specific bus that a passenger selects when requesting a seat.
- **Use:** Always `pickupPoint`, not `stop` or `station`. Hard rule.
- **Plural:** `pickupPoints`

---

## Roles

### `role: admin`
- **Canonical meaning:** An `admin` entity whose `roles` array includes `"admin"` — has full administrative permissions (tour/bus/busType CRUD, seat management, manifest access).
- **Use:** Always `admin` in code/API and UI copy. No alternate UI term ("manager", "organizer") — use `admin` everywhere to avoid a second name for the same concept.
- **⚠️ Naming collision to be aware of:** Every authenticated user is stored in the `admin` collection/entity regardless of permission level — a freshly signed-up user is an `admin` *entity* with `roles: ["user"]`, not `roles: ["admin"]`. Never assume "is an `admin` record" implies "has admin permissions" — always check `roles.includes("admin")`. This is the same collision the reference project had with `user` vs. a booking role; here it's `admin`-the-entity vs. `admin`-the-role-value.

### `role: user`
- **Canonical meaning:** The default `roles` value for every newly signed-up `admin` entity — no administrative permissions until an existing admin promotes them.
- **Use:** Always `user` as the role value. Never implies "passenger" — see `passenger` below, a fully separate concept.

### `passenger`
- **Canonical meaning:** An anonymous end user browsing a tour and requesting a seat. Not a stored entity — their name/phone live directly on the `seat` record they requested (see `seat` above).
- **Use:** Always `passenger` in docs/UI copy. Never referred to as a `user` (that term is reserved for the `role: user` admin-entity permission level — see the collision note above) and never modeled as its own collection/entity in v1.

---

## Actions

### `request` (a seat)
- **Canonical meaning:** A passenger submits their name, phone, and pickup point for an `available` seat, moving it to `pending`. API route family: `seats/bookings`.
- **Use:** Always `request`/`seat request` in docs; the API route group is named `bookings` for historical/reference-project consistency — do not rename the route group, but never use `booking` as the entity name (see `seat` above).

### `approve` (a seat)
- **Canonical meaning:** An admin confirms a `pending` seat, moving it to `taken`. API route: `seats/approve`.
- **Use:** Always `approve`, not `confirm` or `accept`.

### `cancel` (a seat)
- **Canonical meaning:** An admin releases a `pending` or `taken` seat back to `available`. API route: `seats/cancel`.
- **Use:** Always `cancel`, not `release` or `reject` (those are not used as action names, only as informal descriptions of the same operation).

### `toggle-reserve` (a seat)
- **Canonical meaning:** An admin manually places an `available` seat into `reserved` (or reverts a `reserved` seat back to `available`) outside the normal passenger request flow. API route: `seats/toggle-reserve`.
- **Use:** Always `toggle-reserve` as the action name.

### `manual-assign` (a seat)
- **Canonical meaning:** An admin manually sets a specific passenger onto a specific seat, bypassing the passenger-initiated request flow. API route: `seats/manual-assign`.
- **Use:** Always `manual-assign`, not `assign` alone (too ambiguous with `assignedBy` field semantics).

### `swap-move` (seats)
- **Canonical meaning:** An admin moves a passenger from one seat to another, or swaps two passengers between two seats, in a single atomic operation. API route: `seats/swap-move`.
- **Use:** Always `swap-move` as the single action name covering both the move and swap cases — do not split into separate `move`/`swap` route names.

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md`.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.
