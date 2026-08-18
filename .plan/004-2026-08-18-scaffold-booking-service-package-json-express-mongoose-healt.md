# Plan 004 — Scaffold booking-service (package.json, Express, Mongoose, health check)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: booking-service, security, qa

## Goal
Scaffold a new standalone `booking-service` — its own `package.json`, an Express server entrypoint, a Mongoose connection to MongoDB, and a `GET /health` endpoint — so later tasks (Service/TimeSlot/Appointment models, F1–F4b/F6–F11 routes, slot-hold concurrency) have a running service with DB connectivity to build on. This task creates the skeleton and DB wiring only: no Mongoose models/schemas, no business routes, no concurrency logic yet.

## Scope
- In scope: creating `booking-service/` as a new standalone Node/Express package (own `package.json`, `package-lock.json`, entrypoint file, `.gitignore`, minimal `src/` structure), adding `express` and `mongoose` as dependencies, wiring a Mongoose connection to MongoDB using an env-configured connection string, wiring a `GET /health` route that returns a 200 JSON status (and reflects DB connection state), adding npm `start`/`dev` scripts, confirming the server boots locally and connects to MongoDB.
- Out of scope: `Service`/`TimeSlot`/`Appointment` Mongoose models/schemas (`mongoose-models-layer`), any F1–F4b/F6–F11 business routes, slot-hold atomicity/concurrency logic (`seat-concurrency-layer`), JWT verification (owned by `api-gateway`/`user-service`), notification-service integration, Docker/deployment config.
- Repo-relative scope: all new files live under `booking-service/` at the repository root, as a sibling to `frontend/` and `api-gateway/` — this task does not modify `frontend/`, `api-gateway/`, or any other existing folder.

## Assumptions
- `booking-service` is a standalone Node/Express package (consistent with plan 003's `api-gateway` scaffold), matching the PRD's `booking-service` owning Service/TimeSlot/Appointment data and F1–F4b/F6–F11 routes.
- npm is the package manager (consistent with plans 001–003).
- Module system and folder layout mirror `api-gateway` (plan 003): CommonJS, `src/server.js` entrypoint, `package.json` with `start`/`dev` scripts, `nodemon` as a dev dependency.
- MongoDB is the target database (per PRD's Mongoose reference and `mongoose-models-layer`/`database-rules`); a local/dev MongoDB instance is assumed reachable via an env var (e.g. `MONGODB_URI`), not hardcoded.
- No models, auth, or session state are needed for this scaffold — the health check is unauthenticated and stateless beyond reporting DB connectivity.

## Open Questions
1. Should `GET /health` report only "server up" or also reflect live MongoDB connection state (e.g. `{ status: "ok", db: "connected" }`)?
   - Recommended: include DB connection state in the health response — booking-service's core value is data persistence, so a health check that ignores DB status could report "healthy" while the service can't actually serve F1–F11, which is worse than reporting nothing.
2. What env var name and default should be used for the MongoDB connection string, and should the server fail to boot or boot-degraded if MongoDB is unreachable at startup?
   - Recommended: use `MONGODB_URI` with a local default (`mongodb://localhost:27017/booking-service`) for dev convenience; boot the HTTP server regardless of initial DB connection result (log the error, keep retrying via Mongoose's built-in reconnection), so `/health` can meaningfully report a `disconnected` state instead of the process crash-looping.
3. Should this scaffold's folder/script conventions strictly mirror `api-gateway` (plan 003), or diverge given booking-service's extra DB dependency?
   - Recommended: mirror `api-gateway` exactly for consistency (same `src/server.js` layout, same `start`/`dev` scripts, same port-from-env pattern), adding only a `src/db.js` (or similar) module to isolate the Mongoose connection logic.

## Steps
1. `booking-service/` — create the folder and run `npm init` (or hand-write `package.json`) to establish the package, name `booking-service`.
2. `booking-service/package.json` — add `express` and `mongoose` as dependencies; add `nodemon` as a devDependency; add `start` (`node src/server.js`) and `dev` (`nodemon src/server.js`) scripts.
3. `booking-service/src/db.js` — create a Mongoose connection module: reads `process.env.MONGODB_URI` (with local default per Open Question 2), calls `mongoose.connect(...)`, exports the connection/mongoose instance and a way to read current `readyState` for the health check.
4. `booking-service/src/server.js` — create a minimal Express app: instantiate the app, call the `db.js` connect function on startup, add a `GET /health` route returning `{ status: "ok", db: <connected|disconnected> }` (per Open Question 1) with HTTP 200, listen on `process.env.PORT || <default port distinct from api-gateway's>`.
5. `booking-service/.gitignore` — add `node_modules`, `.env`, and any standard Node ignores so installed dependencies and secrets aren't committed.
6. `booking-service/` — run `npm install` to generate `package-lock.json`, then start the server locally (with a local MongoDB instance running or reachable) and confirm `GET /health` responds 200 with the expected JSON body, including correct `db` state.

## Validation
- `booking-service/package.json` exists with `express` and `mongoose` listed under `dependencies` and valid `start`/`dev` scripts.
- `booking-service/package-lock.json` is generated and committed.
- Running `npm start` (or `npm run dev`) in `booking-service/` boots the server without error, with or without MongoDB reachable.
- `curl http://localhost:<port>/health` (or equivalent) returns HTTP 200 with a JSON body indicating healthy server status and current DB connection state.
- Stopping/blocking MongoDB and re-checking `/health` shows `db: disconnected` (or equivalent) rather than crashing the process.
- No existing folder (`frontend/`, `api-gateway/`, or any other service) is modified by this task.

## Risks
- **Data-integrity foundation**: this service will own `TimeSlot`/`Appointment` state where the PRD requires a slot must never be booked twice (`seat-concurrency-layer`, `database-rules`); getting the Mongoose connection/config pattern wrong now (e.g. no connection pooling awareness, wrong write-concern defaults) could complicate correct atomic-hold implementation later — flagged here so `booking-service` agent involvement is warranted even though no models/routes are added yet.
- **No auth yet**: F6–F11 admin routes will later live in this service and depend on `api-gateway`'s JWT verification; this scaffold has zero auth logic by design, so `security` is retained to flag that this bare scaffold must not be treated as auth-ready, and to sanity-check the `.env`/secret-handling pattern (`MONGODB_URI`) established here before it's copied by later tasks.
- **Convention drift**: layout/script decisions made here (mirroring or diverging from `api-gateway`) become the template for `user-service`/`notification-service` scaffolds; mitigated by Open Question 3 and keeping the scaffold minimal.
- **Port/config collisions**: reusing `api-gateway`'s default port or `.env` var names could cause local run conflicts; mitigated by choosing a distinct default port and documented env var name.
- No `frontend`, `user-service`, or `notification-service` code is touched, so they are correctly excluded from Scope-Agents; `qa` is retained to validate the health check boots and correctly reflects DB state.

## Rollout Order
1. Create `booking-service/package.json` and install `express`/`mongoose`/`nodemon` (Steps 1–2).
2. Add `src/db.js` Mongoose connection module (Step 3).
3. Add `src/server.js` with the `/health` route wired to DB state (Step 4).
4. Add `.gitignore`, install, and verify locally including DB-down scenario (Steps 5–6 / Validation).

## Rollback
- Delete the `booking-service/` folder entirely. Since no other service or the frontend references `booking-service` yet, removal is fully isolated and has no downstream impact.
