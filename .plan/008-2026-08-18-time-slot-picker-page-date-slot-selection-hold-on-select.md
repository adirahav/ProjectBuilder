# Plan 008 — Time Slot Picker page (date/slot selection, hold-on-select)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: frontend, booking-service, qa, security

## Goal
Build Screen 2 (Time Slot Picker) from the PRD: a public, unauthenticated page that lets a customer pick a date for the previously-selected `Service`, view only `open` `TimeSlot`s for that date, and attempt to atomically hold a slot (`open` → `held`) on selection. On a hold conflict (slot already claimed), show a clear "no longer available" message and refresh the list. Slot status must never be conveyed by color alone.

## Scope
- In scope (`frontend/`): a `TimeSlotPicker` page mounted at the existing `/book/:serviceId` route (replacing plan 007's placeholder), a date picker control, a slot list/grid component showing only `open` slots with time labels, a "hold" action per slot that calls the hold API, hold-success navigation to the (still-placeholder) Customer Details step, hold-conflict handling (error message + automatic re-fetch of the slot list), loading/empty/error states for the date+service query, accessible status labels/icons (not color-only) per `accessibility-layer`, RTL/LTR-correct layout per `css-layer`, mobile-first responsive styling.
- In scope (`booking-service/`): `GET /api/time-slots?serviceId=&date=` (F2, returns only `open` slots for that service/date) and `POST /api/time-slots/:id/hold` (F3, atomic `open`→`held` transition using a Mongo conditional update so two concurrent holds cannot both succeed — see `seat-concurrency-layer`); a minimal `TimeSlot` Mongoose model (`serviceId`, `date`, `startTime`, `endTime`, `status: open|held|booked`, `heldAt`/hold-expiry field) if not already present. Lazy hold-expiry (F3b) is included at minimal scope: the `GET` list query treats a `held` slot whose hold has expired as `open` again (no separate cron/scheduler yet).
- Out of scope: Customer Details Form / Appointment creation (Screen 3, F4/F4b — the "hold succeeded" path only needs to navigate there, not implement it), Admin appointment management (Screen 7, F9–F11), a real scheduled/cron-based hold-expiry sweeper (a full background job is deferred; only lazy/read-time expiry is included here), `api-gateway` routing for these public routes (called directly against `booking-service`, consistent with plan 007's precedent), seeding/admin creation of `TimeSlot` records (assumed to already exist in the DB for manual verification, or seeded ad hoc — no admin UI for slot generation exists yet).
- Repo-relative scope: frontend changes under `frontend/src/`; backend changes under `booking-service/src/`. No changes to `api-gateway/`, `user-service/`, or `notification-service/`.

## Assumptions
- Plan 007 already established the router, i18n/RTL context, and axios API client pattern (`frontend/src/api/client.ts`); this task reuses and extends that infra rather than re-inventing it.
- Plan 007's `/book/:serviceId` route currently renders a placeholder; this task replaces that placeholder with the real `TimeSlotPicker` page.
- `booking-service` has no `TimeSlot` model or routes yet (only `Service`, from plan 007); this task adds the minimal model + F2/F3 routes needed, not the full slot-generation/admin CRUD surface.
- A hold has a short, fixed TTL (e.g. a few minutes) tracked via a `heldAt` timestamp on the `TimeSlot` document; exact TTL value is called out as an Open Question.
- The atomic hold uses `findOneAndUpdate({ _id, status: 'open' }, { $set: { status: 'held', heldAt: now } })` (or equivalent single conditional Mongo op) so the datastore itself enforces exclusivity, per `seat-concurrency-layer` — no application-level locking.
- Date selection defaults to "today" in the clinic's local timezone; no multi-timezone requirement is stated in the PRD.

## Open Questions
1. What TTL should a slot hold have before it lazily expires back to `open`?
   - Recommended: 5 minutes — long enough to fill out the next-step contact form (Screen 3), short enough to keep availability fresh for other customers; store as a `HOLD_TTL_MS` constant in `booking-service` for easy tuning.
2. Should hold-expiry be enforced only lazily (checked at read/hold time) or should this task also add a scheduled sweeper job?
   - Recommended: lazy-only for this task — the PRD explicitly allows "scheduled/lazy expiry check," and a lazy check on every `GET`/`hold` request is sufficient to keep the list correct without adding a new background-job component; a real sweeper can be a follow-up if stale `held` documents become a concern.
3. How should the frontend represent the just-passed `serviceId` and chosen date across the hold → navigate-to-Customer-Details handoff — URL params/state, or a shared store?
   - Recommended: pass `serviceId` via the existing route param and hold the selected `date`/`slotId` in a small Zustand slice (per `state-management-layer`), then navigate to `/book/:serviceId/details` reading from that slice — avoids stuffing transient booking state into the URL while keeping it available if Screen 3 needs a refresh-safe fallback later.
4. What UI/icon convention should distinguish `open` vs "no longer available" (conflict) slots without relying on color alone?
   - Recommended: `open` slots show a plain time label as a clickable button; a slot that fails to hold (conflict) is immediately removed from the list on refresh rather than shown in a disabled state, and the conflict is communicated via a dismissible inline text banner ("That time was just taken — please pick another slot") plus an icon, satisfying `accessibility-layer` without needing a persistent "booked" visual state on this screen.

## Steps
1. `booking-service/src/models/TimeSlot.js` — Mongoose schema: `serviceId` (ObjectId ref `Service`, required), `date` (String or Date, required), `startTime`/`endTime` (String, required), `status` (enum `open|held|booked`, default `open`), `heldAt` (Date, nullable), timestamps.
2. `booking-service/src/routes/timeSlots.js` — `GET /api/time-slots?serviceId=&date=` handler: query `TimeSlot.find({ serviceId, date })`, treat any `held` doc with `heldAt` older than `HOLD_TTL_MS` as effectively open (either lazily flip it to `open` in the same request or filter it in as available), return only slots that are `open` (including lazily-expired ones) with `status: 'open'`.
3. Same file — `POST /api/time-slots/:id/hold` handler: perform the single atomic conditional update (`open`→`held`, set `heldAt`); return 200 + updated slot on success, return 409 with a clear conflict payload if the conditional update matched zero documents (already held/booked).
4. `booking-service/src/server.js` — mount the new time-slots router under `/api/time-slots`.
5. `frontend/src/api/timeSlots.ts` — `getTimeSlots(serviceId, date)` and `holdTimeSlot(slotId)` functions, typed to a `TimeSlot` interface.
6. `frontend/src/store/booking.ts` (Zustand slice, per `state-management-layer`) — holds selected `serviceId`, `date`, `heldSlotId` for handoff to the next screen.
7. `frontend/src/pages/TimeSlotPicker/TimeSlotPicker.tsx` — page component: date picker (defaults to today), fetches slots for `serviceId`+`date` on change, renders loading/empty ("no open slots this day")/error states, renders the slot list, handles hold click → on success updates the booking store and navigates onward, on 409 conflict shows the inline banner and re-fetches the list.
8. `frontend/src/pages/TimeSlotPicker/SlotButton.tsx` — presentational component per `ui-component-layer`/`accessibility-layer`: accessible button per slot with a clear time label, focus-visible state, no color-only semantics.
9. `frontend/src/router.tsx` — replace the plan-007 placeholder at `/book/:serviceId` with `TimeSlotPicker`, and add a placeholder route `/book/:serviceId/details` for the next screen (Screen 3), mirroring plan 007's "establish the navigation contract" pattern.
10. Manual verification: seed `TimeSlot` docs for a service/date (mix of `open`/`held`/`booked`), run both services, confirm only `open` slots render, confirm holding a slot navigates onward, and simulate a conflict (hold the same slot twice, e.g. via two browser tabs or a direct second API call) to confirm the 409 path shows the message and refreshes the list.

## Validation
- `GET /api/time-slots?serviceId=&date=` returns only slots with effective status `open` for that service/date; a `held` slot past `HOLD_TTL_MS` is included as available.
- `POST /api/time-slots/:id/hold` on an `open` slot returns 200 and flips its status to `held`; calling it again immediately on the same slot returns 409 and leaves the slot `held` (not double-held or corrupted).
- A concurrency check: firing two near-simultaneous `POST /hold` requests at the same open slot (e.g. `Promise.all`) results in exactly one 200 and one 409 — verifying the atomic conditional update, not a read-then-write race.
- Frontend: selecting a date renders that date's open slots; selecting a slot that's still open navigates to the next placeholder route; selecting a slot that another request just claimed shows the "no longer available" message and the list refreshes without the stale slot.
- Slot availability/unavailability is never conveyed by color alone — verified by checking each state also carries a text label or icon.
- Keyboard-only navigation can reach and activate the date picker and every open slot button.
- No changes leak into `api-gateway/`, `user-service/`, or `notification-service/`.

## Risks
- **Concurrency correctness is the core risk of this screen**: the PRD explicitly calls out `seat-concurrency-layer` — a slot must never be held/booked twice. Mitigated by using a single atomic conditional Mongo update for the hold transition (no read-then-write), and by including a concurrent-request test in Validation. `booking-service` is included in Scope-Agents specifically because of this risk, not merely because routes are added.
- **New unauthenticated backend routes**: both `GET /api/time-slots` and `POST /api/time-slots/:id/hold` are new public, unauthenticated surface; `POST /hold` in particular lets any caller mutate state without auth (by design per PRD, but it's a new mutation endpoint an attacker could hammer to grief availability). `security` is included in Scope-Agents to review both routes for input validation (valid ObjectId, valid date format) and abuse potential (e.g. rate-limiting is out of scope for this task but should be flagged, not silently added).
- **Lazy-expiry-only limits correctness under low traffic**: if no one queries a given service/date after a hold expires, that slot can appear stuck `held` indefinitely from an admin/reporting point of view (though it self-heals the next time it's read). Mitigated by scoping this explicitly as an Open Question/Assumption and flagging a real sweeper as a likely follow-up task rather than silently declaring the problem solved.
- **Frontend state handoff risk**: storing `heldSlotId`/`date` in a Zustand slice instead of the URL means a hard page refresh on the details screen loses that state; mitigated by keeping the hold's server-side `heldAt` as the real source of truth (the frontend store is just a convenience) and calling this out in Open Questions rather than over-building a refresh-safe mechanism now.
- No `user-service` or `notification-service` code is touched, so they are correctly excluded from Scope-Agents; `api-gateway` is excluded because this task calls `booking-service` directly and assigns it no work in Steps.

## Rollout Order
1. Backend slice first: `TimeSlot` model + `GET`/`hold` routes in `booking-service` (Steps 1–4), verified via direct HTTP calls including the concurrent-hold test.
2. Frontend API layer + booking store (Steps 5–6).
3. Frontend feature: `TimeSlotPicker` page + `SlotButton`, wired into the router replacing the plan-007 placeholder (Steps 7–9).
4. End-to-end manual verification against both running services (Step 10 / Validation).

## Rollback
- Frontend: remove `frontend/src/pages/TimeSlotPicker/`, `frontend/src/api/timeSlots.ts`, `frontend/src/store/booking.ts`, and revert `router.tsx`'s `/book/:serviceId` entry back to plan 007's placeholder.
- Backend: remove `booking-service/src/models/TimeSlot.js` and `booking-service/src/routes/timeSlots.js`, and unmount the router from `server.js`; no other route or service references `TimeSlot` yet, so removal is isolated.
