All checks pass. Here's what I built.

## Summary

**Screen 3 (Customer Details)** now replaces the plan-008 placeholder: a name/phone/email form over the held `TimeSlot`, a live countdown on the hold, and a `POST /api/appointments` submit that routes to a new Screen 4 confirmation placeholder.

Key decisions worth flagging:

- **The countdown is advisory, never authoritative.** `useCountdown` derives remaining time from the deadline and the clock on every render rather than decrementing a counter, so a throttled tab or sleeping phone can't drift. But the *server's* 409 on submit is what decides whether a booking may proceed — the client timer only closes the form early so nobody types into something that can't succeed.
- **A lapsed hold is an outcome, not an error.** It gets its own explanation and a route back to the picker (mirroring plan 008's hold-conflict handling). A plain network failure explicitly does *not* set `hasHoldExpired` — nothing about a timeout proves the hold is gone, so the form stays usable.
- **Contract change:** I added `holdExpiresAt` to the hold response. The existing contract said `heldAt` was deliberately withheld; I kept that (when a hold *started* is bookkeeping) but exposed the already-computed deadline, which the countdown genuinely needs.
- **`aria-live` split from the ticking display.** Putting a per-second timer in a live region would make a screen reader interrupt itself every second. Visible numerals sit in an ordinary region; a separate polite region speaks only at the last minute and at expiry.

One gap to call out honestly: there's no browser-level e2e harness (Playwright/Cypress) in this repo. The browse → hold → book → confirm flow and the 409 paths are covered as integration tests through the real router and store with only the HTTP layer mocked — that's the existing convention here, but it isn't true cross-service e2e. The concurrency guarantee itself is a `booking-service` responsibility and is specified in the contract.

I did not launch the dev server, so the visual result is unverified — worth an eyeball on the RTL layout of the countdown and form.

=== FRONTEND AGENT REPORT ===
```
Ticket: CUSTOMER-FE
Pages built/changed:
  - frontend/src/pages/CustomerDetailsPage.tsx (placeholder -> real Screen 3)
  - frontend/src/pages/BookingConfirmationPage.tsx (new Screen 4 placeholder)
  - frontend/src/App.tsx (added /book/:serviceId/confirmation route)
Components built:
  - components/appointment/CustomerDetailsForm.tsx
  - components/appointment/CountdownNotice.tsx
  - components/common/FormField.tsx
Services built/changed:
  - frontend/src/services/appointment.service.ts (new)
Store slices built/changed:
  - frontend/src/store/slices/appointment.slice.ts (new)
  - frontend/src/store/store.ts (assembled)
Supporting:
  - types/appointment.types.ts, types/timeSlot.types.ts (+holdExpiresAt)
  - utils/customer.utils.ts, utils/appointmentStatus.utils.ts
  - utils/date.utils.ts (+parseInstant, +formatCountdown)
  - hooks/useCountdown.ts
  - i18n/strings.ts (he + en), test/factories.ts
Lint: PASS
Build: PASS
Tests: 206 passed, 0 failed (16 files; ~60 new across form validation,
       appointment service, appointment slice, countdown hook, and the
       Screen 3 flow incl. the 409 lapsed-hold path)
API contracts:
  - docs/api-contract/api-contract.booking-service.yaml

Handoff to Backend Agent:
- Implement POST /api/appointments per the contract above:
  single atomic held -> booked conditional update (never read-then-write),
  409 on a lapsed/non-held slot, status always created as 'pending',
  best-effort non-blocking call to notification-service (F4b).
- Add holdExpiresAt (heldAt + TTL, ISO instant) to the hold response;
  omit it from the public list endpoint.
- customerName is attacker-controlled free text — see the contract's
  escaping note; this is a public unauthenticated PII-accepting mutation.
- notification-service's own contract is not written here: the frontend
  never calls it directly, so it stays out of the frontend's contract scope.
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```