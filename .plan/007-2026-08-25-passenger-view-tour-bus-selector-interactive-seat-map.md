# Plan 007 — Passenger View: Tour/Bus Selector + Interactive Seat Map

Status: done
Owner: orchestrator
Last updated: 2026-08-25
Scope-Agents: frontend, tour-service, qa, security

## Goal
Implement Screen 3 (Passenger View) from the PRD: a tour/bus selector at the top and an interactive, accessible seat map below it, where clicking an `available` seat opens a seat-request modal (full name, phone, pickup point) that submits a booking, moves the seat to `pending`, and refreshes the seat map from the server — handling seat-taken conflicts gracefully.

## Scope
- In scope:
  - `frontend/`: Tour/bus selector UI (select a tour, then a bus within that tour) at the top of the Passenger View route (replacing/filling in the `/tours` placeholder from plan 006).
  - `frontend/`: Interactive seat map component rendering seat layout with status-colored seats (`available`/`pending`/`taken`/`reserved`), each conveying status via icon + text label/`aria-label` in addition to color, per `accessibility-layer` skill.
  - `frontend/`: Seat-request modal — full name, phone, pickup point (populated from the selected bus's `pickupPoints`), submit handler, inline error/conflict handling, per `ui-component-layer`/`accessibility-layer` skills.
  - `frontend/`: API calls via `api-layer` skill conventions to fetch tours/buses, fetch seat map (`GET /api/buses/:busId/seats`), and submit booking (`POST /api/seats/bookings`).
  - `frontend/`: Zustand slice(s) for selected tour/bus and seat map state, per `state-management-layer` skill.
  - `backend/tour-service/`: `GET /api/tours` and `GET /api/tours/:tourId/buses` (or equivalent) read endpoints to populate the selector, if not already present.
  - `backend/tour-service/`: `GET /api/buses/:busId/seats` (F3) — returns seat layout + current status + `pickupPoints` for the bus.
  - `backend/tour-service/`: `POST /api/seats/bookings` (F4/F5) — creates a `pending` booking on an `available` seat with name/phone/pickup point; enforces atomicity so concurrent requests for the same seat resolve to exactly one success and the other gets a conflict (409) response (F5, AC-6).
- Out of scope:
  - Admin Dashboard (Screen 4) and all admin seat actions (approve/cancel/reserve/assign/swap) — separate plan(s).
  - Tour/Bus/BusType CRUD (Tab 4b) — separate plan.
  - Auth — Passenger View requires no login per PRD ("no auth step").

## Assumptions
- Plan 006's Gateway routes passenger flow to `/tours` (currently a placeholder); this plan implements that route's real content.
- `tour-service` (plan 002) is scaffolded with Express + Mongoose but has no Tour/Bus/Seat models or routes yet; this plan creates the minimum models/schemas needed to serve seats and bookings (Tour, Bus, Seat/Booking), unless a prior plan already introduced them (none found in `.plan/` as of this writing).
- Seat layout data model: a bus has an ordered/positioned set of seats (row, column/position, door-row/back-row flags) plus a status per seat; exact schema shape is decided during implementation per `mongoose-models-layer` skill, since no bus-type template plan exists yet (that's Tab 4b, out of scope here). For this plan, seat layout can be minimally represented (seat id, label, row/col, status) sufficient to render the map; the richer bus-type-template-driven layout generation is left to the Tab 4b plan.
- No design mockups exist for this screen; frontend agent designs the selector and seat map per `.rule/style-rules.md` and relevant skills.
- Seat statuses are exactly the four PRD-listed values: `available`, `pending`, `taken`, `reserved`.

## Open Questions
1. Do `Tour` and `Bus` (and seat/layout) Mongoose models already need to be created from scratch in this plan, or is there tour/bus seed data expected to exist for manual testing?
- Recommended: create minimal `Tour`/`Bus`/`Seat` models in this plan (only the fields needed to list tours/buses and render a seat map + pickup points) and add a small seed script/fixture so the selector and seat map are testable end-to-end without waiting on the Tab 4b admin CRUD plan; Tab 4b's plan can later extend these models rather than redefine them.
2. How should seat-claim atomicity be implemented in `tour-service` to guarantee exactly one success under concurrent booking requests for the same seat (F5)?
- Recommended: use a single atomic MongoDB update (e.g. `findOneAndUpdate` with a filter requiring `status: "available"` and the update setting `status: "pending"` plus passenger fields) so the database enforces the race, returning 409 conflict when the conditional update matches zero documents, rather than a read-then-write pattern in application code.
3. Should the seat map poll/refresh periodically, or only refetch on explicit actions (after a booking submit or conflict)?
- Recommended: refetch only on explicit actions (initial load, after submit success, after conflict) for this plan — add polling or real-time updates (e.g. WebSocket/SSE) only if a later plan calls for live cross-passenger updates, to keep this plan's scope bounded.
4. What identifies a bus's pickup points structurally — free text list per bus, or a separate collection?
- Recommended: store `pickupPoints` as an embedded array of strings/objects directly on the `Bus` document (per PRD's Tab 4b description of a "pickup-points list" as a bus field), avoiding a separate collection until a real need for independent CRUD on it arises.

## Steps
1. `backend/tour-service/`: define minimal `Tour`, `Bus`, `Seat` Mongoose models (Tour: name, dates, soft-delete flag; Bus: tourId, name, seatCount, doorPosition, driverSide, pickupPoints[]; Seat: busId, label/position, status, passenger name/phone/pickupPoint when occupied), per `mongoose-models-layer` skill.
2. `backend/tour-service/`: implement `GET /api/tours` and `GET /api/tours/:tourId/buses` read routes to populate the frontend selector.
3. `backend/tour-service/`: implement `GET /api/buses/:busId/seats` (F3) returning the bus's seat layout with current statuses and its `pickupPoints` list.
4. `backend/tour-service/`: implement `POST /api/seats/bookings` (F4/F5) using an atomic conditional update per Open Question 2's recommendation; return 201 + updated seat on success, 409 + fresh seat-map snapshot (or seat) on conflict.
5. `backend/tour-service/`: add a seed script/fixture creating at least one tour, bus, seat layout, and pickup points for manual/dev testing (per Open Question 1).
6. `backend/tour-service/`: add tests for seat-fetch and booking routes, including a concurrency test asserting exactly one of two simultaneous booking requests for the same seat succeeds.
7. `frontend/`: build the tour/bus selector component (fetches tours, then buses for selected tour) via `api-layer` conventions, wired into a Zustand slice for selected tour/bus, per `state-management-layer` skill.
8. `frontend/`: build the seat map component — renders seats by status with icon + text label + `aria-label` per status (never color alone), per `accessibility-layer` skill; clicking an `available` seat opens the seat-request modal.
9. `frontend/`: build the seat-request modal (full name, phone, pickup point dropdown from selected bus's `pickupPoints`), submit via `POST /api/seats/bookings`; on success close modal and refetch seat map; on 409 conflict, show inline conflict message and refetch seat map so the seat's real state is visible, per `ui-component-layer`/`accessibility-layer` skills.
10. `frontend/`: wire the Passenger View into the `/tours` route (replacing plan 006's placeholder), rendering selector above the seat map.
11. Cross-service: confirm frontend's expected seat/booking response shapes (fields, status enum values, conflict format) match backend's actual implementation before marking done.

## Validation
- `GET /api/tours` and `GET /api/tours/:tourId/buses` return expected data for the seed fixture.
- `GET /api/buses/:busId/seats` returns all seats with correct statuses and the bus's `pickupPoints`.
- `POST /api/seats/bookings` on an `available` seat succeeds, sets status to `pending`, and stores name/phone/pickup point.
- `POST /api/seats/bookings` on a non-`available` seat (or lost race) returns 409 with no state mutation.
- Concurrency test: two simultaneous booking requests for the same seat result in exactly one success and one 409 (F5, AC-6).
- Frontend: selecting a tour populates its buses; selecting a bus renders that bus's seat map.
- Frontend: every seat status is visually distinguishable via icon + text/`aria-label`, not color alone — spot-checked in grayscale/colorblind simulation per `accessibility-layer` skill.
- Frontend: clicking an `available` seat opens the modal; submitting valid data closes the modal and shows the seat as `pending` after refresh.
- Frontend: submitting into a seat that was just taken by someone else shows a conflict message and the seat map reflects the seat's real (non-available) state.
- `qa` agent runs the full passenger flow end-to-end (selector → seat map → booking success → booking conflict).
- `security` agent reviews the booking endpoint for PII handling (name/phone stored/transmitted appropriately, no unnecessary logging) and confirms the passenger flow requires no auth bypass of admin-only routes.

## Risks
- Concurrency risk (data integrity): naive read-then-write booking logic could let two passengers both land on the same seat — mitigated by the atomic conditional-update approach in Step 4 and the dedicated concurrency test in Step 6; `tour-service` is included in scope specifically because of this risk.
- PII risk: seat bookings capture passenger full name and phone number, transmitted and stored in `tour-service` — `security` agent should confirm reasonable handling (no logging of raw PII, appropriate transport) even though no new auth surface is introduced.
- Data-model risk: since no bus-type-template or admin CRUD plan exists yet, the minimal `Tour`/`Bus`/`Seat` models created here are a first draft; Tab 4b's plan may need to extend or migrate them, which should be flagged there rather than silently reworked.
- Accessibility risk: seat status is easy to implement as color-only by mistake — mitigated by explicit icon+label requirement in Steps 8 and Validation, reviewed against `accessibility-layer` skill.

## Rollout Order
1. Backend models + seed data (Steps 1, 5).
2. Backend read routes (Steps 2–3).
3. Backend booking route + concurrency handling + tests (Steps 4, 6).
4. Frontend selector + state wiring (Step 7).
5. Frontend seat map + accessibility (Step 8).
6. Frontend seat-request modal + conflict handling (Step 9).
7. Frontend routing into `/tours` (Step 10).
8. Cross-service contract confirmation (Step 11).
9. QA end-to-end validation, then security review.

## Rollback
Remove the Passenger View route content (reverting `/tours` to plan 006's placeholder), the seat map and seat-request modal components, and the associated Zustand slice; remove `GET /api/tours`, `GET /api/tours/:tourId/buses`, `GET /api/buses/:busId/seats`, and `POST /api/seats/bookings` routes/controllers/tests along with the `Tour`/`Bus`/`Seat` models from `backend/tour-service/` if not yet relied upon by other completed work.
