# PRD — Hila Tours

**Version:** 1.0
**Design Source:** `docs/design/mockups/` (produced by the Designer agent; source of truth for colors, spacing, and component structure)
**Status:** In Development

---

## Overview
Hila Tours is a real-time tour-bus seat management system for two audiences: passengers, who browse a tour's bus and request their own seat from a live, accessible seat map, and admins, who set up tours/buses/bus-type templates and approve, assign, or reassign seats from a dashboard. The server is the single source of truth for seat state at every step, so no two passengers can ever be confirmed into the same seat.

---

## Screens

### Screen 1 — Gateway (Login)
- Entry choice between "Continue as passenger" and "Admin login".
- Admin login is a modal: username, password, submit — returns a JWT on success.
- Invalid credentials show an inline error, no page navigation.
- "Continue as passenger" proceeds directly to tour/bus selection (Screen 3) with no auth step.

### Screen 2 — Admin Signup
- Standalone page (not a modal).
- Fields: full name, email, password (with show/hide toggle).
- "Sign up" button submits and creates the account.
- **Important:** successful signup never grants admin permissions — the account is always created with `roles: ["user"]`. Only an existing admin can promote another account to `admin` (see F2b). The success screen/message must not imply admin access was granted.

### Screen 3 — Passenger View
- Tour/bus selector at the top.
- Interactive seat map with status-colored seats: `available` / `pending` / `taken` / `reserved`.
  - Accessibility: every seat's status must be conveyed by an icon and a text label/`aria-label` in addition to color — never color alone (colorblind/grayscale-safe). See `accessibility-layer` skill.
- Clicking an `available` seat opens a seat-request modal:
  - Fields: full name, phone, pickup point (selected from that bus's `pickupPoints` list).
  - Submitting moves the seat to `pending` and closes the modal, refreshing the seat map from the server.
  - If the seat was claimed by someone else in the meantime, the submission fails with a conflict and the seat map refreshes to show the real current state (see NFR on concurrency, AC-6).

### Screen 4 — Admin Dashboard
Three tabs:

#### Tab 4a — Seat Management
- Live seat map for the selected tour/bus, same accessible status rendering as Screen 3.
- Quick actions per seat:
  - Approve: `pending` → `taken`.
  - Release/cancel: `pending` or `taken` → `available`.
  - Manual reserve: `available` ↔ `reserved` (toggle, outside the passenger request flow).
- "Manual assign / move / swap" modal: pick a seat and either assign a passenger directly, move an occupied seat's passenger to a different seat, or swap two seats' occupants — single atomic operation.

#### Tab 4b — Tours & Buses
- Tour CRUD (create/edit/soft-delete) — list shows only non-deleted tours.
- Bus CRUD (create/edit/soft-delete) per tour — fields: name, seat count, door position, driver side, pickup-points list (add/edit/remove/reorder).
- A new bus can be created either manually or from an existing bus-type template (pre-fills the seat layout).
- Bus-type template management (independent of any specific tour/bus):
  - Fields per template: rows, door-row position, back-row seat count, manually blocked seats.
  - Actions: add, duplicate, reset-to-default, delete.
  - Exactly one template can be marked as the default.

#### Tab 4c — Passenger Manifest Report
- Consolidated table of all seats for the selected tour/bus: passenger name, phone, pickup point, status.
- Filter by status; free-text search across name/phone/pickup point.
- "Copy report" button copies a formatted, shareable summary to the clipboard (for WhatsApp/print sharing).

---

## Functional Requirements

| ID | Requirement | API Route / Service |
|----|---|---|
| F1 | Admin can log in with username/password and receive a JWT | `POST /api/auth/login` (`user-management-service`) |
| F2 | New account can sign up with full name, email, password | `POST /api/auth/signup` (`user-management-service`) |
| F2b | Signup always creates the account with `roles: ["user"]`; only an existing admin can promote a user to `admin` | `PATCH /api/admins/:id/roles` (`user-management-service`) |
| F3 | Passenger can view the current seat map for a selected tour/bus | `GET /api/buses/:busId/seats` (`tour-service`) |
| F4 | Passenger can request an `available` seat with name, phone, and pickup point | `POST /api/seats/bookings` (`tour-service`) |
| F5 | Concurrent requests for the same seat resolve so exactly one succeeds; the other gets a conflict response with a refreshed seat map | `POST /api/seats/bookings` (`tour-service`) |
| F6 | Admin can approve a `pending` seat, confirming it as `taken` | `POST /api/seats/approve` (`tour-service`) |
| F7 | Admin can cancel/release a `pending` or `taken` seat back to `available` | `POST /api/seats/cancel` (`tour-service`) |
| F8 | Admin can manually reserve an `available` seat, or un-reserve a `reserved` seat | `POST /api/seats/toggle-reserve` (`tour-service`) |
| F9 | Admin can manually assign a passenger directly to a seat | `POST /api/seats/manual-assign` (`tour-service`) |
| F10 | Admin can move or swap passengers between two seats in one atomic operation | `POST /api/seats/swap-move` (`tour-service`) |
| F11 | Admin can create, edit, and soft-delete tours | `POST/PATCH/DELETE /api/tours` (`tour-service`) |
| F12 | Admin can create, edit, and soft-delete buses, including their pickup-points list | `POST/PATCH/DELETE /api/buses` (`tour-service`) |
| F13 | Admin can create a bus from an existing bus-type template | `POST /api/buses` with `busTypeId` (`tour-service`) |
| F14 | Admin can add, duplicate, reset-to-default, and delete bus-type templates, with exactly one marked default | `POST/PATCH/DELETE /api/busType` (`tour-service`) |
| F15 | Admin can view a filterable, searchable passenger manifest for a tour/bus | `GET /api/buses/:busId/manifest` (`tour-service`) |
| F16 | Admin can copy a formatted manifest report to the clipboard | Client-side only (uses data from F15) |

---

## Non-Functional Requirements
- Full RTL layout, Hebrew only (no translation infrastructure in v1) — see `css-layer`, `accessibility-layer`.
- Seat-state sync must reflect changes in real time without a full page reload.
- Mobile-first responsive design across all screens.
- Native Android build via Capacitor; JWT stored in `@capacitor/preferences`, never `localStorage`, on the native build — see `native-navigation-layer`.
- WCAG 2.1 AA accessibility: semantic HTML, full keyboard navigation, visible focus states, and no information conveyed by color alone (seat status always paired with icon + text/`aria-label`) — see `accessibility-layer`.
- Every admin action (F2b, F6–F14) requires a valid admin JWT (`roles` includes `admin`); a `user`-only account is rejected.
- The server is the sole source of truth for seat state — the frontend never assumes a seat's status without confirming against the API; concurrent seat requests are arbitrated atomically server-side (see `seat-concurrency-layer`, F5).
- Tour and bus deletion is soft-delete only (`deletedAt` field) — see `database-rules.md`.

---

## Acceptance Criteria
- **AC-1:** An admin with valid credentials can log in and receive a JWT that grants access to the dashboard (F1).
- **AC-2:** A new signup always results in an account with `roles: ["user"]` — the UI never states or implies admin access was granted, and admin-only routes reject this account until promoted (F2, F2b).
- **AC-3:** A passenger sees a live seat map reflecting the true server-side status of every seat, with status conveyed by both color and an icon/text label (F3).
- **AC-4:** A passenger can successfully request an `available` seat, and it visibly moves to `pending` without a page reload (F4).
- **AC-5:** When two passengers submit a request for the same seat at effectively the same time, exactly one request succeeds; the other receives a conflict response and an immediately refreshed, accurate seat map (F5).
- **AC-6:** An admin approving a `pending` seat moves it to `taken`, visible immediately on both the admin dashboard and any open passenger view (F6).
- **AC-7:** An admin canceling a `pending` or `taken` seat returns it to `available` (F7).
- **AC-8:** An admin toggling manual reserve moves an `available` seat to `reserved` and back, without affecting the passenger request flow for other seats (F8).
- **AC-9:** An admin's manual-assign action places a specific passenger directly on a specific seat, setting it to `taken` (F9).
- **AC-10:** An admin's swap-move action correctly exchanges or relocates two seats' occupants in a single operation, with no intermediate inconsistent state visible (F10).
- **AC-11:** Soft-deleting a tour or bus removes it from all list/get views immediately, but the underlying record persists with `deletedAt` set, not physically removed (F11, F12).
- **AC-12:** Creating a bus from a bus-type template pre-fills the correct seat layout (rows, door-row position, back-row seat count, blocked seats) matching the template (F13).
- **AC-13:** Exactly one bus-type template can be marked default at any time; marking a new one default un-marks the previous one (F14).
- **AC-14:** The passenger manifest correctly filters by status and free-text search, and "Copy report" places a correctly formatted summary on the clipboard (F15, F16).
- **AC-15:** Every screen and interactive component matches the visual system established in `docs/design/mockups/` (colors, spacing, component structure) once the Designer agent's mockups are approved.
- **AC-16:** The native Android build stores the JWT in `@capacitor/preferences`, and a logged-in session survives an app restart; the web build never stores the JWT in `@capacitor/preferences`-only storage.
- **AC-17:** Every seat-status indicator remains distinguishable in grayscale/colorblind simulation, via its icon and label alone, with no reliance on color.

---

## Data Model
See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.
- **tour** — `name`, `date`, `description`, `createdBy`, `deletedAt`. Soft-deleted.
- **bus** — belongs to a `tour`; `seatLayout`, `pickupPoints[]` (`name`, `order`), `deletedAt`. Soft-deleted.
- **busType** — independent of any specific tour/bus; `rows`, `doorRowPosition`, `backRowSeatCount`, `manuallyBlockedSeats`, `isDefault`.
- **seat** — belongs to a `bus`; `position`, `status` (`available`/`pending`/`taken`/`reserved`), `pickupPointName`, `passengerName`, `passengerPhone`, `requestedAt`, `approvedAt`, `assignedBy`.
- **admin** — `username`, `email`, `passwordHash`, `roles[]` (`admin`/`user`), `deletedAt`. No separate passenger entity — passenger identity lives on the `seat` record itself.

---

## Out of Scope (v1)
- Online payment.
- Automatic SMS notifications.
- Multi-language support — Hebrew/RTL only.
- Per-tour admin ownership vs. a shared admin pool — open question, deferred.
- A distinct Passenger entity/account system.
- Automated waitlisting when a bus is full.
