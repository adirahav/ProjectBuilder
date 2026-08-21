Implementation complete. Changes are confined to `backend/api-gateway/`; no frontend or sibling-service files were touched.

**What changed**
- `api/lib/config.ts` — added `serveFrontend` (env `SERVE_FRONTEND`, else auto-detect `<repo>/frontend/dist/index.html`) and `frontendDistPath` (env `FRONTEND_DIST_PATH`, else resolved `<repo>/frontend/dist`).
- `api/app.ts` — `createApp()` now takes optional `{ serveFrontend, frontendDistPath }` overrides. Static serving + SPA fallback mounted **last**, after `/health` and all `/api/*` mounts, and skipped entirely for any path starting with `/api` or `/health`. Fallback is GET-only and falls through to the JSON 404 if `index.html` is missing, so a missing/unbuilt `dist` can never crash boot.
- `api/static.test.ts` (new, 9 tests) — fixture `dist` in a temp dir; covers `/` and deep client routes returning `index.html`, asset serving, `/health` unaffected, `/api/unknown` still JSON 404, `/api/services/all` + `/api/appointments` still 401 fail-closed, non-GET not answered with HTML, and both `serveFrontend: false` and missing-dist cases.
- `api/health.test.ts` — the unknown-route 404 test now pins `serveFrontend: false` (it would otherwise flip behaviour depending on whether `frontend/dist` happens to exist locally).
- `.env.example` — documented `SERVE_FRONTEND` / `FRONTEND_DIST_PATH` (commented, no secrets).

**Deliberately not done**
- No new dependency (`express.static` suffices) and no `build:frontend` script — per Open Question 3's recommendation the frontend build stays a separate step.
- Plan Steps 1 and 7 point at `frontend/vite.config.ts` and `backend/api-gateway/docs/` — both outside my allowed paths (`frontend/**` is forbidden, and a `docs/` folder under `backend/` is explicitly disallowed by my instructions). I verified read-only that `frontend/dist` already exists with the expected shape; the deploy flow is documented below instead. **Flag for orchestrator:** a pre-existing `backend/api-gateway/docs/agent-reports/` directory is in the repo from an earlier ticket and should be relocated to the root `docs/agent-reports/`.

**Single-origin deploy flow:** `cd frontend && npm run build` → `cd backend/api-gateway && npm start` → SPA + API both served on port 4000 (auto-detected; set `SERVE_FRONTEND=true` to be explicit in a deploy environment).

=== BACKEND AGENT REPORT ===
```
Ticket: DEPLOYSE-APIG
Service: api-gateway
Date: 2026-08-21

Endpoints implemented:
GET    /health                            ✓ (unauthenticated, never proxied, mounted first)
POST   /api/auth/login                    ✓ (no JWT gate — proxied to user-service)
GET    /api/services/all                  ✓ (JWT-gated, proxied to booking-service)
POST   /api/services                      ✓ (JWT-gated)
PATCH  /api/services/{id}                 ✓ (JWT-gated)
PATCH  /api/services/{id}/deactivate      ✓ (JWT-gated)
GET    /api/appointments                  ✓ (JWT-gated)
PATCH  /api/appointments/{id}/confirm     ✓ (JWT-gated)
PATCH  /api/appointments/{id}/cancel      ✓ (JWT-gated)
GET    /* (non-/api, non-/health)         ✓ static dist + SPA fallback, mounted last

Data models: none — api-gateway is stateless, no database connection

Unit tests: 162 passed, 0 failed (9 new static/SPA-fallback tests)

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

STATUS: DONE