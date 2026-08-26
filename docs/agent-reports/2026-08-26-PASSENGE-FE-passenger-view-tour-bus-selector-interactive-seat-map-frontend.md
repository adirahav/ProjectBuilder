All checks pass. 

A previous run of this ticket was interrupted by an API error immediately after the message "Now the API contract for `tour-service`" — so the React implementation and tests were already complete on disk, but the contract file was never written. I verified the existing work against the plan, wrote the missing contract, and fixed a test-suite flake.

**What I verified as already complete and correct:**
- `TourBusSelector`, `SeatMap`, `SeatButton`, `SeatLegend`, `SeatRequestModal` wired into `ToursPage` at `/tours`
- `tour`/`bus`/`seat` services all routed through `http.service.ts`, all with `withAuth: false` (the passenger surface is unauthenticated by design, and this also prevents a stale admin JWT from triggering the global 401 redirect)
- Services write to the store directly; components don't duplicate the update
- Every seat status carries a Lucide icon + Hebrew label + `aria-label`, never color alone
- 409 is classified as its own `ConflictError` and gets distinct Hebrew copy, and the seat map is re-fetched after **every** outcome — success, conflict, and failure alike

**What I changed:**
1. **Wrote `docs/api-contract/api-contract.tour-service.yaml`** (the missing deliverable). Two constraints I made explicit and binding for the backend agent, since they're the ones easiest to get wrong:
   - **Atomicity:** the booking endpoint must use a single conditional update filtered on `status: "available"`. I spelled out that a read-then-write is *not* acceptable, because two concurrent requests can both observe `available` and both succeed — the 409 must fall out of the update matching zero documents.
   - **PII boundary:** the seat map is public, so seat objects must never carry `fullName`/`phone`/`pickupPoint` — not even back to the passenger who just booked. Passenger fields are write-only on this contract.

2. **Raised `testTimeout`/`hookTimeout` to 20s** in `vitest.config.ts`. One conflict test failed on the full run but passed 20/20 in isolation. The cause is worker contention, not a bug: Vitest's 5s budget starts ticking while the forked worker is still booting jsdom, and this machine's environment setup is very slow (~483s cumulative). The test was failing on machine load rather than behavior. This bounds genuine hangs without weakening any assertion.

One note for whoever picks this up: I could not visually confirm the rendered screen, since launching a dev server would block the orchestrator indefinitely. Lint, build, and the full suite are green, but the grayscale/colorblind spot-check called for in the plan's Validation section still needs a human eye.

=== FRONTEND AGENT REPORT ===
```
Ticket: PASSENGE-FE
Pages built/changed: frontend/src/pages/ToursPage.tsx (Screen 3 — Passenger View, replacing plan 006 placeholder)
Components built/changed: components/passenger/{TourBusSelector,SeatMap,SeatButton,SeatLegend,SeatRequestModal}.tsx, components/form/SelectField.tsx
Services built/changed: tour.service.ts, bus.service.ts, seat.service.ts (all via http.service.ts)
Store slices built/changed: tour.slice.ts, bus.slice.ts, seat.slice.ts (assembled in store.ts)
Lint: PASS
Build: PASS
Tests: 159 passed, 0 failed (12 files)
API contracts:
  - docs/api-contract/api-contract.tour-service.yaml

Handoff to Backend Agent:
- Implement endpoints per service contract above
- CRITICAL: POST /api/seats/bookings must use a single atomic conditional
  update (filter status:"available") — a read-then-write lets two concurrent
  requests both succeed. 409 must come from the update matching zero docs.
- Seat responses must omit fullName/phone/pickupPoint — the seat map is a
  public, unauthenticated surface.
- pickupPoint must be validated server-side against the owning bus's list.
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```