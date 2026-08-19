Typecheck clean, all tests pass.

=== BACKEND AGENT REPORT ===
```
Ticket: BOOKINGC-APT
Service: booking-service
Date: 2026-08-19

Endpoints implemented:
  GET  /health                     ✓ (pre-existing)
  GET  /health/ready               ✓ (pre-existing)
  GET  /api/services               ✓ (pre-existing, SERVICEL-APT)
  GET  /api/time-slots             ✓ (pre-existing, TIMESLOT-APT)
  POST /api/time-slots/{id}/hold   ✓ (pre-existing, TIMESLOT-APT)
  POST /api/appointments           ✓ (pre-existing, CUSTOMER-APT)
  GET  /api/appointments/{id}      ✓ NEW — this ticket (AppointmentReceipt)

Data models: Service, TimeSlot, Appointment (no schema changes this ticket)

Unit tests: 126 passed, 0 failed
  (11 new in api/appointment/appointment-receipt.test.ts)

To run:
cd backend/booking-service && npm run dev   # port 4001

STATUS: DONE
```

Notes for the orchestrator:

- **Scope resolved.** Plan 010's Open Questions 1/2 were already resolved in the contract's favour — `docs/api-contract/api-contract.booking-service.yaml` defines `GET /api/appointments/{id}` returning `AppointmentReceipt`. That is the only backend work this ticket required; nothing else was added. `Scope-Agents` in the plan omits `backend`, but the contract's inclusion of the route makes the backend slice (plan Step 2 / Rollout Order 2) in scope.
- **Read-only guarantee** is asserted by an explicit test: after a receipt fetch, the `TimeSlot` keeps `status: booked` and its original `heldAt`, and the `Appointment` is unchanged.
- **PII surface, per contract's security note and plan Risk 1.** The response is projected field-by-field (no doc spread), so only the documented `AppointmentReceipt` keys serialize. A malformed id returns **400** and a missing one **404**, but both carry the identical generic body `{"error":"Not Found"}`, so the route cannot be used as an existence oracle while enumerating. Ids are `randomUUID` (v4), never sequential. A test rejects a percent-encoded `{"$ne":null}` path segment before it can reach a query filter. **Rate limiting and a separate opaque confirmation token remain open follow-ups** outside this ticket — worth routing to the `security` agent as the plan intends.
- **Soft-deleted `Appointment` → 404**, via the model's existing `pre('findOne')` hook. A deactivated (`isActive: false`) `Service` still renders on the receipt, which is intended: a receipt records what was booked.
- **Dangling refs** (`serviceId`/`timeSlotId` no longer resolving) are treated as 404 rather than serialized as a partial receipt, since the contract marks `service` and `timeSlot` required.
- No files outside `backend/booking-service/` were touched.

STATUS: DONE