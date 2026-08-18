My changes are confined to `backend/booking-service/` (frontend changes are another agent's).

Implemented PRD F1 for `booking-service`: the public `GET /api/services` route, the `Service` Mongoose model with schema-enforced soft-delete and `uuid`→`id` serialization, and a service/controller/routes split per `backend-service-layer`. Existing env files already covered every required variable, so none were added. Added `mongodb-memory-server` as a dev dependency so tests run against a real in-memory Mongo rather than a mock.

Notable safety points: the DB filter is a hardcoded literal (query string is never read, so no NoSQL injection), responses expose exactly the five contract fields (no `_id`, `__v`, `createdAt`, `deletedAt`), inactive and soft-deleted records are excluded while their documents remain, and errors return the uniform `{ error }` envelope with `503` for an unreachable DB vs `500` for unexpected failures. `TimeSlot`/`Appointment` remain deliberately unimplemented — out of scope for this ticket.

=== BACKEND AGENT REPORT ===
```
Ticket: SERVICEL-APT
Service: booking-service
Date: 2026-08-18

Endpoints implemented:
GET /api/services  ✓  (public, unauthenticated; active-only; 200 / 500 / 503)
GET /health        ✓  (pre-existing, unchanged — mounted first, no auth, no DB)
GET /health/ready  ✓  (pre-existing, unchanged)

Data models: Service (uuid, name, durationMinutes, price, isActive, createdAt, deletedAt)

Unit tests: 18 passed, 0 failed
  - api/health.test.ts        7 passed
  - api/service/service.test.ts  11 passed

To run:
cd backend/booking-service && npm run dev   # port 4001

STATUS: DONE
```

STATUS: DONE