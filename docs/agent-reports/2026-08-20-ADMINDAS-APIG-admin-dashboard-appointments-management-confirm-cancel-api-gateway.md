All config already in place — no env changes needed. The `appointment-proxy` module is complete and wired.

=== BACKEND AGENT REPORT ===
```
Ticket: ADMINDAS-APIG
Service: api-gateway
Date: 2026-08-21

Endpoints implemented:
✓ GET   /health                              (pre-existing, unauthenticated, verified still first)
✓ GET   /api/appointments                    F9  — list, optional ?date= & ?status= filters, behind verifyJwt
✓ PATCH /api/appointments/:id/confirm        F10 — pending -> confirmed, behind verifyJwt
✓ PATCH /api/appointments/:id/cancel         F11 — pending|confirmed -> cancelled, behind verifyJwt
(pre-existing, untouched: POST /api/auth/login, GET /api/services/all,
 POST /api/services, PATCH /api/services/:id, PATCH /api/services/:id/deactivate)

Data models: none — api-gateway is a stateless gateway with no database connection

Unit tests: 153 passed, 0 failed (67 new in appointment-proxy.test.ts)

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

**Files created:** `api/appointment-proxy/appointment-proxy.controller.ts`, `.routes.ts`, `.test.ts`
**Files edited:** `api/app.ts` — replaced the F9-F11 placeholder NOTE with `app.use('/api/appointments', verifyJwt, appointmentProxyRouter)`
`appointment-proxy.service.ts` already existed and needed no change. No env changes (`BOOKING_SERVICE_URL` already configured). `tsc --noEmit` clean.

**Contract decisions worth noting:**
- **Guard at the mount point**, matching `service-proxy` — any route added to this router later is gated by default. Consequence: an unauthenticated `POST /api/appointments` against the *gateway* answers 401, not 404. Intentional fail-closed; the public F4/F4b flow is unaffected since the frontend calls booking-service directly. Covered by tests.
- **Empty-string filters (`?date=`, `?status=`) are dropped, not forwarded** — the contract states an absent filter must never be read as an empty-string match. Repeated params (`?status=a&status=b`, which Express reads as an array) are a 400, not silently reduced to one value.
- **`date` is validated as a real calendar day**, not just the `YYYY-MM-DD` shape — `2026-02-30` is a 400. Parsed as UTC so the host timezone can't shift the day boundary. Past dates accepted.
- **409 relays booking-service's message** (e.g. `Appointment is not pending`) since it names the status actually required; falls back to a generic message if absent.
- **Cancel makes exactly one upstream call** — the TimeSlot release is booking-service's job. A test asserts the gateway never issues a second request and never retries the losing side of a race, which would risk a double release.

**Two things for the orchestrator, outside my write scope:**
1. My routes return whatever booking-service sends. The `AdminAppointment` joins, the atomic transitions, and the TimeSlot release are plan Steps 1–4 (`booking-service`) — if that agent hasn't landed yet, these routes will proxy to 404s until it does.
2. There is a stray `backend/api-gateway/docs/agent-reports/2026-08-19-ADMINLOG-SEC-...md` — a prior agent wrote a report relative to its shell directory instead of the repo root, exactly the mistake CLAUDE.md warns about. It likely belongs at `docs/agent-reports/`. I left it alone rather than move or delete someone else's report.

STATUS: DONE