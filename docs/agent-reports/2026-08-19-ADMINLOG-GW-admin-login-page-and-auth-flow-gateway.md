Implementation complete for `api-gateway`. All 26 tests pass and `tsc --noEmit` is clean.

**What I built:**
- `api/lib/jwt.ts` — verify-only helper (gateway never signs). Fails closed if `JWT_SECRET` is unset, and collapses expired/malformed/wrong-signature into one opaque error.
- `api/routing/routing.middleware.ts` — `verifyJwt`: rejects missing/malformed/expired/non-admin-role tokens with a uniform `401 {error:"Unauthorized"}`, attaches decoded claims to `req.admin`, and sets `x-internal-admin` **after** verification so a client-supplied value can't be spoofed. Exported ready for Screens 6–7; not applied to any route yet (none exist).
- `api/auth-proxy/` — `.service.ts` / `.controller.ts` / `.routes.ts` per the repo's per-domain convention. `POST /api/auth/login` validates presence, forwards **only** `identifier` + `password` to `user-service`, and normalizes responses: `200` passthrough, `400` on missing fields (short-circuited before any upstream call), `401` always as the generic `Invalid credentials` regardless of what upstream said, and `502` for both unreachable-upstream and any non-2xx/401/400 upstream status — so an upstream `500` can never surface as a credential problem. The password is never trimmed, logged, or echoed.
- `api/app.ts` — mounted `/api/auth` unauthenticated, replacing the SCAFFOLD-GW deferral comment.

**Flags for the orchestrator:**
- `backend/api-gateway/.env.example` carries a `JWT_EXPIRES_IN` left over from scaffolding. The gateway only verifies tokens and never issues them, so this var is unused here — `user-service` owns expiry. Harmless, but worth cleaning up in a later pass.
- Per the contract, `user-service` must sign tokens with a `sub` (Admin uuid) and `role: "admin"` claim, using the identical `JWT_SECRET`. My middleware rejects a validly-signed token lacking `role: "admin"`, so a mismatch here would fail closed rather than silently pass.
- No rate-limiting/lockout on the login proxy — deliberately out of scope per the plan, but the gateway is the natural place to add it later since it's the single ingress.

=== BACKEND AGENT REPORT ===
```
Ticket: ADMINLOG-GW
Service: api-gateway
Date: 2026-08-19

Endpoints implemented:
GET  /health           ✓ (pre-existing, unauthenticated, mounted first)
POST /api/auth/login   ✓ (200 / 400 / 401 / 502, unauthenticated by design)

JWT verification middleware:
verifyJwt (api/routing/routing.middleware.ts) ✓ exported, ready to gate F6-F11

Data models: none — api-gateway is stateless with no database connection

Unit tests: 26 passed, 0 failed
  - health.test.ts (3)
  - auth-proxy/auth-proxy.test.ts (12)
  - routing/routing.middleware.test.ts (11)

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

STATUS: DONE