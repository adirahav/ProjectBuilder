# Plan 003 — Scaffold api-gateway service (package.json, Express, health check)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: security, qa

## Goal
Scaffold a new standalone `api-gateway` service — its own `package.json`, an Express server entrypoint, and a `GET /health` endpoint — so later tasks (JWT verification middleware, proxying admin routes to `user-service`/`booking-service`) have a running service to build on. This task creates the skeleton only: no routing/proxy logic, no JWT verification yet.

## Scope
- In scope: creating `api-gateway/` as a new standalone Node/Express package (own `package.json`, `package-lock.json`, entrypoint file, `.gitignore`, minimal `src/` structure), adding Express as a dependency, wiring a `GET /health` route that returns a 200 JSON status, adding an npm `start`/`dev` script, confirming the server boots locally.
- Out of scope: JWT verification middleware (`jwt-middleware-layer`), proxying/forwarding any of the F5–F11 admin routes to `user-service` or `booking-service`, CORS/rate-limiting/logging middleware beyond what's needed to boot, Docker/deployment config, environment-variable/config management beyond a minimal `PORT` default.
- Repo-relative scope: all new files live under `api-gateway/` at the repository root, as a sibling to `frontend/` and any backend service folders — this task does not modify `frontend/` or any existing backend service.

## Assumptions
- `api-gateway` is a standalone Node/Express package (consistent with plan 001's finding that this repo uses standalone service folders rather than a monorepo/workspace root), matching the PRD's `api-gateway` fronting `user-service` and `booking-service`.
- npm is the package manager (consistent with plans 001–002).
- Node's built-in ESM or CommonJS module style should match whatever convention other backend services in this repo already use; if no other backend service folder exists yet, default to a minimal, conventional Express setup (CommonJS, `index.js` or `src/server.js`).
- No database, auth, or session state is needed for this scaffold — the health check is unauthenticated and stateless.

## Open Questions
1. Does any backend service folder (e.g. `user-service`, `booking-service`) already exist in this repo to mirror conventions (module system, folder layout, linting config) from?
   - Recommended: check the repo root first; if none exist yet, use a minimal conventional layout (CommonJS, `src/server.js`, `package.json` with `start`/`dev` scripts) and treat this scaffold as the reference pattern for the sibling services to follow.
2. Should the health check path be exactly `/health` or namespaced under `/api/health` to match the PRD's `/api/...` route convention for proxied routes?
   - Recommended: use `/health` (unnamespaced) — it's an infra/liveness check consumed by orchestration tooling, not a proxied business route, so it shouldn't collide with or imply `/api` request forwarding semantics.
3. Should `nodemon` (or similar) be added for local dev, or is a plain `node` start script sufficient at scaffold stage?
   - Recommended: add `nodemon` as a devDependency with a `dev` script for local iteration convenience, keeping `start` as plain `node` for production-like runs.

## Steps
1. `api-gateway/` — create the folder and run `npm init` (or hand-write `package.json`) to establish the package, name `api-gateway`.
2. `api-gateway/package.json` — add `express` as a dependency; add `nodemon` as a devDependency (pending Open Question 3); add `start` (`node src/server.js`) and `dev` (`nodemon src/server.js`) scripts.
3. `api-gateway/src/server.js` — create a minimal Express app: instantiate the app, add a `GET /health` route returning `{ status: "ok" }` with HTTP 200, listen on `process.env.PORT || <default port>`.
4. `api-gateway/.gitignore` — add `node_modules` (and any standard Node ignores) so installed dependencies aren't committed.
5. `api-gateway/` — run `npm install` to generate `package-lock.json`, then start the server locally and confirm `GET /health` responds 200 with the expected JSON body.

## Validation
- `api-gateway/package.json` exists with `express` listed under `dependencies` and valid `start`/`dev` scripts.
- `api-gateway/package-lock.json` is generated and committed.
- Running `npm start` (or `npm run dev`) in `api-gateway/` boots the server without error.
- `curl http://localhost:<port>/health` (or equivalent) returns HTTP 200 with a JSON body indicating healthy status.
- No existing folder (`frontend/`, or any other service) is modified by this task.

## Risks
- **Auth boundary not yet enforced**: the PRD requires `api-gateway` to verify JWTs on all Admin routes (F5–F11); this scaffold intentionally ships with zero auth logic, so it must not be mistaken for "gateway complete" — flagged here so `security` review confirms the follow-up JWT-middleware task is tracked separately and that this bare scaffold is never deployed as if it already gates admin traffic.
- **Convention drift**: if this is the first backend service folder created, decisions made here (module system, folder layout, script names) become the de facto template other services copy — getting the layout wrong is more costly to fix later; mitigated by Open Question 1 and keeping the scaffold minimal/conventional.
- **Port/config collisions**: no `.env` handling is included yet, so a hardcoded default port could collide with other locally-run services (frontend dev server, other backend services); mitigated by reading `process.env.PORT` with a documented default.
- No functional business logic, no data mutation, and no new business API routes are introduced, so `booking-service`, `user-service`, `notification-service`, and `frontend` are correctly excluded from Scope-Agents; `qa` is retained to validate the health check boots and responds correctly, and `security` is retained solely to flag the missing-auth risk above for the required JWT follow-up task.

## Rollout Order
1. Create `api-gateway/package.json` and install `express`/`nodemon` (Steps 1–2).
2. Add `src/server.js` with the `/health` route (Step 3).
3. Add `.gitignore`, install, and verify locally (Steps 4–5 / Validation).

## Rollback
- Delete the `api-gateway/` folder entirely. Since no other service or the frontend references `api-gateway` yet, removal is fully isolated and has no downstream impact.
