# Plan 008 — Seat-Request Modal (Name, Phone, Pickup Point) with Concurrency-Safe Request Handling

Status: done
Owner: orchestrator
Last updated: 2026-08-26
Scope-Agents: frontend, tour-service, qa, security

## Goal
The backlog item "Seat-request modal (name, phone, pickup point) with concurrency-safe request handling" describes functionality that Plan 007 (Passenger View: Tour/Bus Selector + Interactive Seat Map, `Status: done`) already implemented end-to-end: `frontend/src/components/passenger/SeatRequestModal.tsx` collects name/phone/pickup point, `backend/tour-service/api/seat/seat.service.ts` + `seat.controller.ts` implement `POST /api/seats/bookings` with an atomic conditional update for concurrency safety, and both have passing tests. This plan's goal is therefore **not to re-implement the feature**, but to (a) verify the existing implementation actually satisfies every PRD requirement tied to this backlog item (F4, F5, AC-6), (b) close any gaps found, and (c) record the outcome so the backlog item can be resolved as "already delivered" or "delivered + hardened" rather than duplicated.

## Scope
- In scope:
  - `backend/tour-service/`: audit `seat.service.ts`, `seat.controller.ts`, `seat.routes.ts`, and `__tests__/seatBooking.test.ts` against F4/F5/AC-6 — confirm the booking update is a single atomic conditional write (`status: "available"` → `status: "pending"` in one operation), confirm the 409 conflict path returns a refreshed seat/seat-map snapshot, and confirm no passenger PII leaks into the public seat-map response (already noted as deliberate in `toPublicSeat`).
  - `backend/tour-service/`: add/extend a true concurrency test if the current `seatBooking.test.ts` does not already fire two simultaneous booking requests at the same seat and assert exactly one 201 and one 409.
  - `frontend/`: audit `SeatRequestModal.tsx`, `seat.service.ts`, and `seat.slice.ts` against the PRD flow — submit closes the modal on success, refreshes the seat map from the server, and on conflict shows an inline message plus a seat-map refresh (not just a toast).
  - `frontend/`: confirm client-side validation (name/phone/pickup point) matches `ui-component-layer`/`accessibility-layer` conventions and that pickup points are sourced from the selected bus's `pickupPoints`, not hardcoded.
  - Fix any concrete gap discovered by the audit (e.g., missing concurrency test, missing conflict refresh, validation gap) — kept minimal and targeted, not a rewrite.
  - Update `.plan/007-...md` cross-reference note if this plan changes shared code, so the two plans don't silently diverge.
- Out of scope:
  - Any new feature beyond what F4/F5/AC-6 and Screen 3's seat-request modal describe (e.g., admin-side seat actions, manifest report) — those belong to their own plans/backlog items.
  - Rewriting or restructuring the existing modal/booking implementation if the audit finds it already correct.

## Assumptions
- Plan 007 is the authoritative prior implementation of this exact feature; its agent reports in `docs/agent-reports/2026-08-26-PASSENGE-*` reflect real completed work (frontend, tour-service, qa, security all reported), so this plan starts from "assume correct, verify, then fix gaps" rather than "assume broken."
- The backlog item was likely filed before Plan 007 was recognized as covering it, or is intentionally a verification/hardening pass; either way, duplicating the implementation from scratch would conflict with and likely regress the existing, tested code.
- No `user-management-service` involvement: the seat-request flow is explicitly unauthenticated per the PRD ("Continue as passenger... with no auth step"), so that service is excluded from scope.

## Open Questions
1. Should this plan close as a no-op (pure verification, no code changes) if the audit finds Plan 007's implementation already fully satisfies F4/F5/AC-6, or should it proactively add defense-in-depth (e.g., a stress-style concurrency test with >2 concurrent requests) regardless of audit outcome?
- Recommended: perform the audit first; if `seatBooking.test.ts` already asserts exactly-one-success under two simultaneous requests, treat that as satisfying AC-6 and only add a higher-concurrency (e.g., 5–10 simultaneous requests) test as a low-cost hardening addition, without touching the production code path if it's already atomic.
2. Should the backlog item itself be marked as a duplicate of Plan 007's delivered scope once this audit completes?
- Recommended: yes — record the finding explicitly in this plan's outcome/QA notes so the backlog isn't re-picked and re-implemented again later; the orchestrator or human reviewer should close the backlog entry referencing Plan 007 and this plan.

## Steps
1. `backend/tour-service/`: read `api/seat/seat.service.ts`, `api/seat/seat.controller.ts`, `api/seat/seat.routes.ts` in full and confirm the booking write path uses a single atomic conditional update (e.g. `findOneAndUpdate` with `status: "available"` in the filter) rather than read-then-write.
2. `backend/tour-service/`: read `__tests__/seatBooking.test.ts`; if it does not already fire concurrent requests (e.g. `Promise.all` of two `POST /api/seats/bookings` calls on the same seat) and assert exactly one 201 + one 409, add that test.
3. `frontend/`: read `SeatRequestModal.tsx`, `frontend/src/services/seat.service.ts`, `frontend/src/store/slices/seat.slice.ts`, and the page that mounts the modal; confirm success closes the modal and triggers a seat-map refetch, and a 409 response keeps the modal open with an inline `submitError` plus triggers a seat-map refetch (per the component's own doc comment claiming this behavior).
4. `frontend/`: confirm pickup points rendered in the modal come from the selected bus's `pickupPoints` (via props/state), not a static list.
5. `frontend/` + `backend/tour-service/`: confirm no passenger PII (name/phone) is present in any unauthenticated seat-map response payload (already asserted in `seat.service.ts` comments) by checking the actual `PublicSeat` type and any other response-shaping code path (e.g. websocket/polling payloads, if any exist).
6. Record audit findings (pass/fail per F4, F5, AC-6, PII) in this plan or a short note in `docs/agent-reports/`; fix only the concrete gaps found, each as a minimal targeted change with its own test.
7. Re-run the full `tour-service` and `frontend` test suites to confirm no regressions from any fix made in Step 6.

## Validation
- `backend/tour-service` test suite (`seatBooking.test.ts` and any new concurrency test) passes, including an explicit assertion that under N simultaneous booking requests for one seat, exactly one succeeds (201) and the rest are rejected (409) with no seat left in a corrupted/double-booked state.
- `frontend` test suite (`seat.service.test.ts`, `seat.slice.test.ts`, `seat.utils.test.ts`, and any `SeatRequestModal` tests) passes.
- Manual/QA check: submitting a valid seat request closes the modal and the seat map shows the seat as `pending`.
- Manual/QA check: two browser sessions racing for the same seat result in one success and one visible conflict message with a refreshed seat map on the losing session.
- No passenger PII (`fullName`, `phone`, `pickupPoint`) appears in the response body of the unauthenticated `GET /api/buses/:busId/seats` endpoint.
- `qa` agent confirms the above end-to-end.
- `security` agent confirms the PII-isolation behavior in Step 5 still holds and that no new/changed code introduces a PII leak or an auth-bypass in the passenger flow.

## Risks
- Duplicate-work risk: if this plan is executed as a naive re-implementation instead of an audit, it risks reverting or conflicting with Plan 007's already-tested, working code — mitigated by explicitly scoping this plan to "audit + targeted fix" in Goal/Scope.
- Concurrency risk (data integrity): F5/AC-6 require exactly one success under a race for the same seat; even though Plan 007 claims this is handled atomically, this plan's core purpose is to independently verify that claim with a real concurrent test — `tour-service` is in scope specifically for this reason.
- PII risk: name/phone are passenger PII flowing through `tour-service`'s booking endpoint and stored on the `Seat` document; this plan re-verifies the existing PII-isolation design (`PublicSeat` omitting identity fields) rather than assuming it's still correct after any change.
- Process risk: if the backlog item isn't explicitly marked as covered/duplicate after this plan, it may be re-selected again in a future cycle, wasting another planning pass — mitigated by Open Question 2's recommendation to record the duplicate finding.

## Rollout Order
1. Backend audit (Steps 1–2).
2. Frontend audit (Steps 3–4).
3. Cross-cutting PII audit (Step 5).
4. Record findings; apply any minimal fixes (Step 6).
5. Full regression test run (Step 7).
6. QA end-to-end confirmation, then security review.

## Rollback
Since this plan is primarily an audit, rollback applies only to any targeted fixes made in Step 6: revert those specific commits/diffs (e.g., a newly added concurrency test, a small conflict-handling fix) without touching the rest of Plan 007's implementation, which remains the baseline.
