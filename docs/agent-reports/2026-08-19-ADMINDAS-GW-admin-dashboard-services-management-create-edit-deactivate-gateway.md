All four routes were already implemented from a prior run of this ticket. I verified them against the contract rather than rewriting: routes, validation, error mapping, and header handling all match `api-contract.api-gateway.yaml`. Tests pass (86/86) and `tsc --noEmit` is clean.

Two things I found that I did **not** silently change, since both sit outside my allowed paths:

**Blocker (cross-service, pre-existing):** the four routes I own are gated by `verifyJwt`, which requires `{ sub, role: 'admin' }` claims (`api-gateway/api/lib/jwt.ts:32`). But `user-service` signs `{ userId, roles: ['admin'] }` (`user-service/api/auth/auth.service.ts:88`). A real Admin token is therefore rejected with 401 by every route in this ticket. The gateway's tests pass only because they mint their own `{sub, role}` tokens — nothing exercises both sides together. This was already raised as CRITICAL in the ADMINLOG-SEC report and is still unfixed. The gateway side is correct per its own contract; the fix belongs in `user-service` (a forbidden path for me), so plan Step 10 / the `401`-gating Validation line cannot pass end-to-end until it lands.

**Housekeeping:** `backend/api-gateway/docs/agent-reports/` exists — the stray-`docs/`-under-`backend/` mistake CLAUDE.md forbids. I checked whether it was a safe duplicate of the root copy; it is **not** (the root file holds the orchestrator-saved summary, the stray holds the fuller report body), so I left it rather than destroy unique content. It needs a human decision on merging into `docs/agent-reports/`.

=== BACKEND AGENT REPORT ===
```
Ticket: ADMINDAS-GW
Service: api-gateway
Date: 2026-08-20

Endpoints implemented:
GET   /health                              ✓ (unauthenticated, mounted first)
POST  /api/auth/login                      ✓ (pre-existing, ungated by design)
GET   /api/services/all                    ✓ (verifyJwt-gated, -> booking-service)
POST  /api/services                        ✓ (verifyJwt-gated, -> booking-service)
PATCH /api/services/:id                    ✓ (verifyJwt-gated, -> booking-service)
PATCH /api/services/:id/deactivate         ✓ (verifyJwt-gated, -> booking-service)

Data models: none — api-gateway is stateless, no DB connection

Unit tests: 86 passed, 0 failed (4 files; 60 in service-proxy.test.ts)
Typecheck: tsc --noEmit clean

Notes:
- Guard applied at the MOUNT POINT (app.ts:39), so routes added later are
  gated by default; unauthenticated GET /api/services fails closed as 401.
- x-internal-admin is set from the verified token only; a client-supplied
  value can never survive the hop (covered by test).
- Create relays only name/durationMinutes/price — never isActive or
  injected id/_id (covered by test).
- booking-service 503 (DB down) is mapped to 502, per contract.

BLOCKER (outside this service): user-service signs {userId, roles} but the
gateway verifies {sub, role}. All four routes above will 401 for real Admin
tokens until user-service's claim shape is fixed. Not fixable from
api-gateway; needs the user-service agent.

FLAG: backend/api-gateway/docs/agent-reports/ is a stray docs/ folder under
backend/. Its contents are NOT a duplicate of the root copy, so it was left
in place for a human merge decision rather than deleted.

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

STATUS: DONE