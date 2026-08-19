The CUSTOMER-APT slice for `booking-service` is fully in place and verified: the `Appointment` model, the `POST /api/appointments` route (atomic `held`→`booked` conditional update, server-side hold-TTL expiry check, serviceId cross-check, strict body validation, `pending`-only status), the best-effort notification-service client with a 3s timeout, and env config (`NOTIFICATION_SERVICE_URL`). All 115 tests pass, including the double-submit and many-simultaneous-submit concurrency tests proving exactly one 201 and the rest 409.

=== BACKEND AGENT REPORT ===
```
Ticket: CUSTOMER-APT
Service: booking-service
Date: 2026-08-19

Endpoints implemented:
GET  /health                        ✓ (liveness, no auth, no DB)
GET  /health/ready                  ✓ (readiness, reports DB state)
GET  /api/services                  ✓ (F1, active only)
GET  /api/time-slots                ✓ (F2/F3b, lazy hold expiry)
POST /api/time-slots/{id}/hold      ✓ (F3, atomic open→held)
POST /api/appointments              ✓ (F4/F4b, atomic held→booked, 201/400/404/409/500/503)

Data models: Service, TimeSlot, Appointment

Unit tests: 115 passed, 0 failed
  - health: 7 | service: 11 | time-slot: 45 | appointment: 52
  - includes concurrent double-submit (exactly one 201, one 409),
    many-simultaneous-submit single-winner, lapsed-hold 409,
    notification-service-down still returns 201

To run:
cd backend/booking-service && npm run dev   # port 4001

STATUS: DONE
```

STATUS: DONE