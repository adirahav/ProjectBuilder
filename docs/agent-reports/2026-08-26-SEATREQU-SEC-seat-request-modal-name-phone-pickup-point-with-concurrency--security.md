Security audit for SEATREQU-SEC complete. Summary:

- **Backend (`tour-service` seat booking)**: Verified the `available`→`pending` transition uses a single atomic `findOneAndUpdate`, not read-then-write. Independently re-tested concurrency (2-way and via existing 10-way test) — exactly one winner, no double-allocation. `status` can never be client-supplied (allowlist rejects unknown fields). PII (name/phone/pickup point) never leaks into any response, including the public seat-map GET. CORS restricted, body size capped, soft-deleted bus correctly blocks bookings.
- **API contract**: Matches implementation exactly (atomicity invariant, PII boundary, public/no-auth intent all documented and honored).
- **Frontend (`SeatRequestModal.tsx`, `seat.service.ts`)**: No XSS surface, no PII in console logs, pickup points sourced from bus data not hardcoded, server is sole source of truth for seat status (no optimistic updates).
- **New tests**: 8 tests written to `docs/tests/security/seat-request-modal.security.test.ts`, all passing, plus confirmed the existing 30-test `seatBooking.test.ts` suite is still green.
- **Dependency audit**: frontend clean; `tour-service` has 1 high/1 critical in dev-only `vite`/`vitest`/`esbuild` tooling (no production exposure, pre-existing, out of this feature's scope) — flagged as LOW, non-blocking; `user-management-service` correctly out of scope per plan.

Zero CRITICAL/HIGH findings in application code or contracts.

STATUS: DONE