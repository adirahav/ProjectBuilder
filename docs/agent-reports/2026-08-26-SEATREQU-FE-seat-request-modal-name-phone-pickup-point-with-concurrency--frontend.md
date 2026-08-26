My only change is `frontend/vitest.config.ts` (the `docs/LAST_PLAN.md` diff was pre-existing from the orchestrator).

## Audit findings

This plan is explicitly scoped as **audit + targeted fix, not re-implementation** — Plan 007 already delivered this feature. I verified each frontend requirement against the actual code rather than rebuilding it.

**All frontend audit points PASS:**

- **F4 (modal fields)** — `SeatRequestModal.tsx` collects name/phone/pickup point with inline per-field validation, errors clearing on correction, and blur-time validation. Errors render inline, never as toasts.
- **Pickup points are dynamic** (Step 4) — `ToursPage.tsx:191` passes `seatMap?.bus.pickupPoints ?? []`. Not hardcoded. Single-option lists auto-select.
- **F5 / AC-6 (conflict handling)** — `handleSubmitRequest` treats `ConflictError` as its own case with a distinct message, keeps the modal open, and the `finally` block re-fetches the seat map after *every* outcome (success, 409, network, unknown). `modalSeat` re-resolves from the refreshed map, so the losing session sees the seat's real status in place.
- **No optimistic state** — `seat.service.ts` writes back only the server-confirmed seat via `applySeat`; the slice refuses seats belonging to a different bus, so late responses can't corrupt the map.
- **PII isolation** (Step 5) — the `Seat` type carries no `fullName`/`phone`/`pickupPoint`, so the unauthenticated seat-map surface structurally cannot leak passenger identity. Service logs reference only ids and counts.
- **Concurrency test already exists** — `ToursPage.test.tsx:394` fires two simultaneous `requestSeat` calls and asserts exactly one fulfilled and one rejected with a 409 `ConflictError`. Plan Open Question 1's condition is met, so I did **not** touch the production path.

**One real gap found and fixed.** The plan's own Validation step requires the frontend suite to pass, but `npm run test` — the documented command — was *failing*, not on any assertion but on `[vitest-pool]: Timeout waiting for worker to respond`. Vitest spawned one fork per core, and the simultaneous jsdom boots starved each other past the pool's startup deadline; 11 errors, only 1 of 12 files ran. I confirmed the tests themselves were healthy (159/159 pass serially), then capped `maxWorkers: 2`. That is both stable and *faster* than the uncapped default (64s vs. a 93s failed run), since the forks no longer contend during startup.

No API contract file was written: this ticket introduces no new or changed endpoints, and `api-contract.tour-service.yaml` already specifies the atomic conditional update, the exactly-one-201/one-409 rule, and the PII non-echo requirement.

**Recommendation for the orchestrator:** per plan Open Question 2, close this backlog item as **delivered by Plan 007 + verified here**, so it isn't re-picked and re-implemented in a future cycle.

Note: I did not audit `backend/tour-service/` (Steps 1–2, and the backend half of Step 5) — `backend/**` is forbidden to me. Those steps need the tour-service agent.

=== FRONTEND AGENT REPORT ===
```
Ticket: SEATREQU-FE
Pages built/changed: none (audit only — ToursPage.tsx verified, unchanged)
Services built/changed: none (seat.service.ts verified, unchanged)
Store slices built/changed: none (seat.slice.ts verified, unchanged)
Other changed: frontend/vitest.config.ts (cap fork pool; fixes failing `npm run test`)
Lint: PASS
Build: PASS
Tests: 159 passed, 0 failed (12 files)
API contracts:
  - none written — no new/changed endpoints; existing
    docs/api-contract/api-contract.tour-service.yaml already covers
    GET /api/buses/{busId}/seats and POST /api/seats/bookings

Handoff to Backend Agent:
- Frontend audit found no gaps in F4/F5/AC-6 or PII handling; no contract change needed
- Steps 1, 2 and the backend half of Step 5 remain OPEN — they require reading
  backend/tour-service/api/seat/* and __tests__/seatBooking.test.ts, which are
  outside frontend's allowed paths
- Confirm the booking write is a single atomic conditional update, and that a
  server-side concurrency test asserts exactly one 201 + N-1 409s
- See .rule/database-rules.md for collection schemas
```

STATUS: DONE