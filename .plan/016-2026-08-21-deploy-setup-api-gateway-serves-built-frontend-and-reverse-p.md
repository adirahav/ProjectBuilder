# Plan 016 — Deploy setup: api-gateway serves built frontend and reverse-proxies

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: api-gateway, qa, security

## Goal
Make `backend/api-gateway` capable of serving the production-built `frontend/` static assets (from `frontend/dist`) as well as continuing to reverse-proxy `/api/...` calls to `booking-service`/`user-service`, so the whole app (SPA + API) can be deployed as a single origin/process instead of requiring the frontend dev server and gateway to run as separate hosts in production. This closes the gap between the current dev-only setup (Vite dev server on `:5173` + gateway on `:4000` with CORS) and a single-origin production deployment.

## Scope
- In scope:
  - `backend/api-gateway/api/app.ts` — add static-file serving of `frontend/dist` and an SPA fallback (serve `index.html` for any unmatched non-`/api` GET route), mounted so it does not shadow existing `/health` and `/api/*` routes.
  - `backend/api-gateway/api/lib/config.ts` — add any new config needed (e.g. a `frontendDistPath` or `SERVE_FRONTEND` flag) so this behavior can be toggled/pathed for local dev vs. deployment.
  - `backend/api-gateway/package.json` — rely on Express's built-in `express.static` (no new proxy library needed since routes already proxy via existing proxy services); if a root-level build/deploy convenience script is needed, add one script in `backend/api-gateway/package.json` (e.g. `build:frontend`) that runs `npm run build` inside `frontend/` before starting the gateway.
  - `frontend/vite.config.ts` — confirm/set the build `outDir` (default `dist`) is the path the gateway expects; only change if a mismatch is found.
  - Documentation: a short note (e.g. `backend/api-gateway/docs/agent-reports/` or root `DEMO-GUIDE.md`) describing the single-origin deploy flow (`build frontend` → `start api-gateway` → app served from gateway's port).
- Out of scope: containerization/Docker, CI/CD pipeline, cloud provider config, HTTPS/TLS termination, process managers (pm2/systemd), notification-service proxying (already out of scope per existing `app.ts` comments), any new business API routes.
- Repo-relative scope: frontend build output consumed from `frontend/dist`; all gateway changes live in `backend/api-gateway/`; no changes to `backend/booking-service/`, `backend/user-service/`, or `backend/notification-service/`.

## Assumptions
- `frontend/` already builds via `npm run build` (`tsc -b && vite build`) into `frontend/dist` (Vite's default `outDir`), per `frontend/package.json` and `frontend/vite.config.ts` (no custom `outDir` currently set).
- `backend/api-gateway` is an Express + TypeScript (`tsx`) service (`backend/api-gateway/api/app.ts`, `server.ts`, `lib/config.ts`), already reverse-proxying `/api/auth`, `/api/services` (admin), `/api/appointments` (admin) with a JWT-gated mount pattern and a `/health` liveness route mounted first.
- In production/single-origin mode, the frontend-origin/CORS setting becomes largely moot for same-origin requests, but CORS config should remain for any cross-origin/dev usage; this plan does not remove CORS.
- Static file serving must be mounted AFTER `/health` and AFTER the `/api/*` proxy mounts (or scoped to exclude `/api`), so a static/SPA-fallback route never shadows an API 401/404 semantics already documented in `app.ts` (fail-closed behavior for `/api/services` and `/api/appointments`).
- The public unauthenticated booking routes (`GET /api/services`, time-slots, `POST /api/appointments`, etc.) are still called directly against `booking-service`, not proxied through `api-gateway` today (per existing comments in `app.ts`); this plan does not change that routing decision, only adds static serving on top.

## Open Questions
1. Should api-gateway serve the built frontend unconditionally, or only when an env flag (e.g. `SERVE_FRONTEND=true`) is set, so local dev (Vite dev server + separate gateway) is unaffected?
   - Recommended: gate it behind a config flag defaulting to serving static files only if `frontend/dist` exists on disk (auto-detect), with an explicit `SERVE_FRONTEND` env override for clarity in deploy environments — this keeps local dev (`npm run dev` in `frontend/`) working unchanged since `dist` won't exist until a build is run.
2. Where should the SPA fallback (serve `index.html` for unmatched client-side routes like `/admin/dashboard`) be positioned relative to the existing 404 handler in `app.ts`?
   - Recommended: place static serving + SPA fallback immediately before the final catch-all 404 handler, and only trigger the fallback for GET requests that don't start with `/api` or `/health` — preserving the existing JSON 404 for unmatched `/api/*` calls.
3. Should the frontend build step be wired into `backend/api-gateway`'s own `npm start`, or documented as a separate manual/deploy-script step?
   - Recommended: keep them separate (document a two-step deploy: `npm run build` in `frontend/`, then `npm start` in `backend/api-gateway`) rather than coupling the gateway's start script to building a sibling package — this keeps the gateway's own scripts fast for local iteration and avoids surprising rebuilds on every `npm start`.
4. Does the public booking flow's direct-to-`booking-service` routing (bypassing api-gateway for `GET /api/services`, time-slots, `POST /api/appointments`) still hold for the single-origin production deploy, or should those become gateway-proxied too so only one port needs to be exposed externally?
   - Recommended: keep this plan scoped to static-serving only and flag the direct-to-booking-service public routes as a follow-up question for a future plan — since PRD F1-F4 route table lists them as booking-service-served, changing that routing is a larger decision that should get its own plan and its own security/CORS review, not be bundled into a deploy-serving task.

## Steps
1. `frontend/vite.config.ts` — verify (no change expected) that build output goes to `frontend/dist`; run `npm run build` in `frontend/` once to confirm the artifact shape (`index.html` + `assets/`).
2. `backend/api-gateway/api/lib/config.ts` — add `serveFrontend` (boolean, default: auto-detect via `frontend/dist` existing) and `frontendDistPath` (default: resolved path to `../../../frontend/dist` relative to the gateway, or an env-overridable absolute path) to `config`.
3. `backend/api-gateway/api/app.ts` — after the existing `/api/auth`, `/api/services`, `/api/appointments` mounts and before the final 404 handler, conditionally (`if (config.serveFrontend)`) mount `express.static(config.frontendDistPath)` and add a GET fallback that serves `index.html` for any request not starting with `/api` or `/health`, leaving the JSON 404 handler as the last-resort branch for everything else (including unmatched `/api/*`).
4. `backend/api-gateway` local env example file(s) — document the new `SERVE_FRONTEND` / dist-path env var(s) with sensible defaults and comments (no secret values involved).
5. `backend/api-gateway/api/health.test.ts` (or a new `backend/api-gateway/api/static.test.ts`) — add tests: with `serveFrontend` on and a fixture `dist` present, confirm `GET /` and an arbitrary client route both return the SPA's `index.html` with 200, while `GET /api/unknown` still returns the existing JSON 404, and `/health` is unaffected.
6. `backend/api-gateway/package.json` — no new runtime dependency required (Express's built-in `express.static` covers this); add a `build:frontend` convenience script only if Open Question 3 is answered in favor of coupling (default recommendation keeps them separate, so this step may be a no-op pending that answer).
7. Documentation — add a short "Single-origin deploy" section (root `DEMO-GUIDE.md` or `backend/api-gateway/docs/agent-reports/`) describing: build frontend → set the serve-frontend flag (or rely on auto-detect) → start api-gateway → app reachable on the gateway's single port.

## Validation
- `cd frontend && npm run build` produces `frontend/dist/index.html` and assets.
- With `frontend/dist` present and the gateway started, `curl http://localhost:4000/` returns the built `index.html` (200).
- A deep client-side route, e.g. `curl http://localhost:4000/admin/dashboard`, also returns `index.html` (SPA fallback), not a 404.
- `curl http://localhost:4000/health` still returns `{ "status": "ok" }` unaffected.
- `curl http://localhost:4000/api/unknown-route` still returns the existing JSON `{ "error": "Not Found" }` 404, proving the SPA fallback does not shadow API routes.
- Existing `verifyJwt`-gated routes (`/api/services`, `/api/appointments`) still return 401 without a token, unaffected by the new static middleware ordering.
- All existing `backend/api-gateway` tests (`npm test` in `backend/api-gateway`) plus the new static/SPA-fallback test(s) pass.
- With `frontend/dist` absent (no build run) and no override flag set, the gateway boots normally and behaves exactly as before (no crash from a missing static directory).

## Risks
- **Route-ordering regression**: mounting static/SPA-fallback in the wrong position could shadow `/api/*` 401/404 semantics that `app.ts` explicitly documents as fail-closed for admin routes — mitigated by Step 3's explicit ordering and Step 5's regression tests; `security` is included in Scope-Agents specifically to verify this ordering doesn't weaken the JWT-gated mount points.
- **Missing-directory crash risk**: `express.static` pointed at a non-existent `frontend/dist` (e.g. gateway started before a frontend build) must not crash the process — mitigated by the auto-detect/guarded config in Step 2 and the last validation bullet.
- **CORS/config drift**: introducing single-origin serving alongside the existing frontend-origin CORS setting could create confusing dual-mode behavior (dev proxy vs. prod same-origin) if not documented — mitigated by Step 7 documentation and keeping CORS config untouched/additive only.
- **Scope creep into public routing**: Open Question 4 flags that public booking routes still bypass the gateway; this plan deliberately does not change that, to avoid conflating a deploy-serving task with a routing/security-boundary redesign — `booking-service` and `user-service` are correctly excluded from Scope-Agents since no code in those services changes.

## Rollout Order
1. Confirm frontend build output path (Step 1).
2. Add gateway config for static serving (Step 2).
3. Wire static serving + SPA fallback into `app.ts` with correct ordering (Step 3).
4. Update env examples and add regression tests (Steps 4–5).
5. Add optional build convenience script pending Open Question 3 (Step 6).
6. Document the single-origin deploy flow (Step 7).

## Rollback
- Revert the `app.ts` and `config.ts` changes (remove the static-serving block and its config fields); the gateway returns to its current API-only, no-frontend-serving behavior with zero impact on `booking-service`, `user-service`, or `notification-service`, since none of those are touched by this plan.
