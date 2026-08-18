# Plan 006 — Scaffold notification-service (package.json, Express, health check)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: notification-service, qa

## Goal
Scaffold a new standalone `notification-service` — its own `package.json`, an Express server entrypoint, and a `GET /health` endpoint — so a later task (F4b: receiving a server-to-server call from `booking-service` to send a booking confirmation notification) has a running service to build on. This task creates the skeleton only: no notification-sending logic, no endpoint for receiving confirmation requests yet.

## Scope
- In scope: creating `notification-service/` as a new standalone Node/Express package (own `package.json`, `package-lock.json`, entrypoint file, `.gitignore`, minimal `src/` structure), adding Express as a dependency, wiring a `GET /health` route that returns a 200 JSON status, adding an npm `start`/`dev` script, confirming the server boots locally.
- Out of scope: the actual notification endpoint (`POST` route consumed by `booking-service` for F4b), any email/SMS provider integration, message templating, retry/queue logic, auth on any route, Docker/deployment config, environment-variable/config management beyond a minimal `PORT` default.
- Repo-relative scope: all new files live under `notification-service/` at the repository root, as a sibling to `frontend/`, `api-gateway/`, `booking-service/`, and `user-service/` — this task does not modify any of those existing folders.

## Assumptions
- `notification-service` is a standalone Node/Express package, consistent with the pattern established in plans 003 (`api-gateway`), 004 (`booking-service`), and 005 (`user-service`) — CommonJS, `src/server.js` entrypoint, `start`/`dev` npm scripts, `nodemon` devDependency.
- npm is the package manager (consistent with plans 001–005).
- No database is needed for this scaffold: `notification-service` is stateless at this stage (it will not persist notification records in v1 per the PRD, which only requires it to be called server-to-server on booking).
- No auth is needed for this scaffold's health check; whether the future F4b notification endpoint needs internal auth (e.g. a shared secret between `booking-service` and `notification-service`) is deferred to that later task.

## Open Questions
1. Should `notification-service` include a placeholder dependency (e.g. an email-sending library) now, or stay dependency-free beyond Express until the F4b endpoint task?
   - Recommended: stay dependency-free beyond `express`/`nodemon` for this scaffold — choosing an email/SMS provider is a separate decision that shouldn't block getting a bootable health-check service in place.
2. What default port should `notification-service` use to avoid colliding with `api-gateway`, `booking-service`, `user-service`, and the `frontend` dev server?
   - Recommended: pick the next unused port in sequence after the other services (e.g. continue the existing convention from plans 003–005), read from `process.env.PORT` with that value as the documented default.
3. Should the health check path be exactly `/health` or namespaced under `/api/health`?
   - Recommended: use `/health` (unnamespaced), consistent with plan 003's decision for `api-gateway` — it's an infra/liveness check, not a proxied business route.

## Steps
1. `notification-service/` — create the folder and run `npm init` (or hand-write `package.json`) to establish the package, name `notification-service`.
2. `notification-service/package.json` — add `express` as a dependency; add `nodemon` as a devDependency; add `start` (`node src/server.js`) and `dev` (`nodemon src/server.js`) scripts.
3. `notification-service/src/server.js` — create a minimal Express app: instantiate the app, add a `GET /health` route returning `{ status: "ok" }` with HTTP 200, listen on `process.env.PORT || <default port>`.
4. `notification-service/.gitignore` — add `node_modules` (and any standard Node ignores) so installed dependencies aren't committed.
5. `notification-service/` — run `npm install` to generate `package-lock.json`, then start the server locally and confirm `GET /health` responds 200 with the expected JSON body.

## Validation
- `notification-service/package.json` exists with `express` listed under `dependencies` and valid `start`/`dev` scripts.
- `notification-service/package-lock.json` is generated and committed.
- Running `npm start` (or `npm run dev`) in `notification-service/` boots the server without error.
- `curl http://localhost:<port>/health` (or equivalent) returns HTTP 200 with a JSON body indicating healthy status.
- No existing folder (`frontend/`, `api-gateway/`, `booking-service/`, `user-service/`) is modified by this task.

## Risks
- **Integration point not yet built**: the PRD requires `booking-service` to call `notification-service` server-to-server on booking (F4b); this scaffold intentionally ships with no endpoint to receive that call, so it must not be mistaken for "notification flow complete" — flagged here so a follow-up task adds the receiving endpoint and `booking-service` wires up the call, and so `security` reviews that integration point (unauthenticated internal service-to-service calls) when it lands. `notification-service` is included in Scope-Agents because this task creates its codebase; no other backend service's code changes here, so `booking-service`, `user-service`, and `api-gateway` are correctly excluded.
- **Convention drift**: since `api-gateway`, `booking-service`, and `user-service` scaffolds already exist (plans 003–005), this task must follow their established conventions rather than introduce a new pattern; mitigated by the Assumptions section and Open Questions 2–3 explicitly referencing prior plans.
- **Port collisions**: no `.env` handling is included yet, so a hardcoded default port could collide with other locally-run services; mitigated by reading `process.env.PORT` with a documented, sequence-consistent default (Open Question 2).

## Rollout Order
1. Create `notification-service/package.json` and install `express`/`nodemon` (Steps 1–2).
2. Add `src/server.js` with the `/health` route (Step 3).
3. Add `.gitignore`, install, and verify locally (Steps 4–5 / Validation).

## Rollback
- Delete the `notification-service/` folder entirely. Since no other service or the frontend references `notification-service` yet, removal is fully isolated and has no downstream impact.
