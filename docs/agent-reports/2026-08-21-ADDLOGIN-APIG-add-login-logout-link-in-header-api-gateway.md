The api-gateway service is fully implemented against its contract and all 162 tests pass. The approved plan for this ticket explicitly requires **no backend changes** — so I made none.

**Analysis:**
- **Plan scope** (`.plan/017-...md`) lists `Scope-Agents: frontend, qa, security` and states under Scope/Risks: *"No backend route changes (F5 is already wired)"* and *"this task only reads existing `auth` slice state and calls the existing `logout()` action, so `api-gateway` ... correctly excluded from Scope-Agents."*
- **Logout is client-side only** (inherited Plan 011 decision — no server-side token revocation/blacklist), so there is no logout endpoint to add. The contract has no such path.
- **Login (F5) already exists**: `POST /api/auth/login` is implemented in `api/auth-proxy/` and mounted ungated at `app.use('/api/auth', authProxyRouter)` — correctly *before* `verifyJwt`, since it's how the token is obtained.
- **Verified route/gating order** in `api/app.ts`: `GET /health` (no auth, no upstream) → `/api/auth` (ungated) → `/api/services` + `/api/appointments` (both behind `verifyJwt`) → static → SPA fallback. Matches the contract's security blocks exactly.

**One item to flag** (per my instructions, rather than editing outside my lane): there is a stray misplaced report at `backend/api-gateway/docs/agent-reports/2026-08-19-ADMINLOG-SEC-admin-login-page-and-auth-flow-security.md`. Agent reports belong at repo-root `docs/agent-reports/`; a `docs/` folder under `backend/` should not exist. It's a prior agent's file, so I left it in place for the orchestrator to relocate.

=== BACKEND AGENT REPORT ===
```
Ticket: ADDLOGIN-APIG
Service: api-gateway
Date: 2026-08-21

Endpoints implemented (pre-existing, verified against contract — no changes this ticket):
  GET   /health                              ✓ (ungated, no upstream, mounted first)
  POST  /api/auth/login                      ✓ (ungated by design — 200/400/401/502)
  GET   /api/services/all                    ✓ (adminJwt)
  POST  /api/services                        ✓ (adminJwt)
  PATCH /api/services/{id}                   ✓ (adminJwt)
  PATCH /api/services/{id}/deactivate        ✓ (adminJwt)
  GET   /api/appointments                    ✓ (adminJwt)
  PATCH /api/appointments/{id}/confirm       ✓ (adminJwt)
  PATCH /api/appointments/{id}/cancel        ✓ (adminJwt)

Data models: none (stateless gateway, no database connection — per spec)

Code changes this ticket: NONE — plan 017 is frontend-only (AppHeader + i18n).
  Logout is client-side only; no server-side revocation endpoint exists or was
  required. Login (F5) was already wired and is unchanged.

Unit tests: 162 passed, 0 failed (6 files)

Flagged for orchestrator (not edited — outside my lane):
  Misplaced prior report at backend/api-gateway/docs/agent-reports/
  2026-08-19-ADMINLOG-SEC-admin-login-page-and-auth-flow-security.md
  should live at repo-root docs/agent-reports/.

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

STATUS: DONE