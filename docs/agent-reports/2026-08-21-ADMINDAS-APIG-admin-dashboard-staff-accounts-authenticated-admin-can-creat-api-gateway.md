Both required env vars (`JWT_SECRET`, `USER_SERVICE_URL`) already exist — no new configuration needed.

**What I changed** (all inside `backend/api-gateway/api/`):

- **`auth-proxy/auth-proxy.service.ts`** — added `forwardRegister(input, internalAdminId)`, forwarding to `user-service` `POST /api/auth/register`. It relays only `name`/`email`/`password` and sets `x-internal-admin` from the *verified* token, never from inbound headers.
- **`auth-proxy/auth-proxy.controller.ts`** — added `registerAdmin`: validates name (2–60), email (format + ≤254, normalised to trimmed lower-case), password (8–72 **bytes**, bcrypt's real ceiling, never trimmed/logged/echoed); maps upstream 201→201, 400→400, 409→generic "An account with that email already exists", anything else→502.
- **`auth-proxy/auth-proxy.routes.ts`** — the security-critical split: `login` stays public, `register` gets `verifyJwt` **per-route**, with a block comment explaining why the guard cannot move to the mount point in either direction.
- **`app.ts`** — replaced the `/api/auth` mount comment to document the split.

**Key design decision:** the `/api/auth` mount is deliberately the only one *without* a mount-point guard, since its two routes need opposite auth. I put the guard at the route and commented both places, because the failure mode is asymmetric and silent — moving it up locks every Admin out, dropping it opens Admin-account minting to the internet.

**One thing to flag:** there's a pre-existing stray `backend/api-gateway/docs/agent-reports/` directory from an earlier agent. My CLAUDE.md says a `docs/` folder under `backend/` "must never happen" (reports belong at repo-root `docs/agent-reports/`). I left it alone since it's outside this ticket, but it should be relocated.

=== BACKEND AGENT REPORT ===
```
Ticket: ADMINDAS-APIG
Service: api-gateway
Date: 2026-08-21

Endpoints implemented:
  POST   /api/auth/login                    ✓ (public — unchanged)
  POST   /api/auth/register                 ✓ (NEW — gated by verifyJwt, PRD F12/AC-10)
  GET    /api/services/all                  ✓ (pre-existing)
  POST   /api/services                      ✓ (pre-existing)
  PATCH  /api/services/{id}                 ✓ (pre-existing)
  PATCH  /api/services/{id}/deactivate      ✓ (pre-existing)
  GET    /api/appointments                  ✓ (pre-existing)
  PATCH  /api/appointments/{id}/confirm     ✓ (pre-existing)
  PATCH  /api/appointments/{id}/cancel      ✓ (pre-existing)
  GET    /health                            ✓ (pre-existing)

Data models: none — api-gateway is stateless with no database connection

Unit tests: 188 passed, 0 failed (26 new, covering the register route)
  Security-critical coverage:
    - 401 with no token, wrong-secret token, expired token, malformed header,
      non-admin role claim — user-service is never called in any of these
    - 401 is returned BEFORE validation, so a bad body with no token is still 401
    - login remains reachable with no token (the split did not lock it out)
    - /api/signup, /api/register, /api/auth/signup are not mounted
    - client-supplied x-internal-admin cannot survive the hop
    - no password, hash, or token in any response; password never echoed in errors
  TypeScript: tsc --noEmit clean

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

STATUS: DONE