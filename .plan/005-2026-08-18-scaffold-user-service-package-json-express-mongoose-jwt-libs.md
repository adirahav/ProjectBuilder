# Plan 005 — Scaffold user-service (package.json, Express, Mongoose, JWT libs, health check)

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: user-service, security, qa

## Goal
Scaffold a new standalone `user-service` — its own `package.json`, an Express server entrypoint, a Mongoose connection to MongoDB, JWT/password-hashing libraries installed and ready, and a `GET /health` endpoint — so a later task (Admin `User` model, `POST /api/auth/login` per F5) has a running service with DB connectivity and auth libraries to build on. This task creates the skeleton, DB wiring, and dependency installation only: no `User` model/schema, no `/api/auth/login` route, no JWT issuance/verification logic yet.

## Scope
- In scope: creating `user-service/` as a new standalone Node/Express package (own `package.json`, `package-lock.json`, entrypoint file, `.gitignore`, minimal `src/` structure); adding `express`, `mongoose`, `jsonwebtoken`, and `bcrypt` (or `bcryptjs`) as dependencies; wiring a Mongoose connection to MongoDB using an env-configured connection string; wiring a `GET /health` route that returns a 200 JSON status (and reflects DB connection state); adding npm `start`/`dev` scripts; confirming the server boots locally and connects to MongoDB.
- Out of scope: the `User` (Admin) Mongoose model/schema (`mongoose-models-layer`), the `POST /api/auth/login` route (F5) and any JWT signing/verification logic, password-hashing usage (library is installed but unused), `api-gateway`'s JWT verification middleware (owned separately, per `jwt-middleware-layer`), any other business routes, Docker/deployment config.
- Repo-relative scope: all new files live under `user-service/` at the repository root, as a sibling to `frontend/`, `api-gateway/`, and `booking-service/` — this task does not modify any existing folder.

## Assumptions
- `user-service` is a standalone Node/Express package (consistent with plan 003's `api-gateway` and plan 004's `booking-service` scaffolds), matching the PRD's `user-service` owning Admin auth and F5 (`POST /api/auth/login`).
- npm is the package manager (consistent with plans 001–004).
- Module system and folder layout mirror `booking-service` (plan 004): CommonJS, `src/server.js` entrypoint, `src/db.js` Mongoose connection module, `package.json` with `start`/`dev` scripts, `nodemon` as a dev dependency.
- MongoDB is the target database (per PRD's Mongoose reference and `mongoose-models-layer`/`database-rules`); a local/dev MongoDB instance is assumed reachable via an env var (e.g. `MONGODB_URI`), not hardcoded, distinct from `booking-service`'s database/URI.
- `jsonwebtoken` and `bcrypt` are installed now (per task title "JWT libs") so the later login-route task doesn't need a separate dependency-install step, but neither library is wired into any route in this task.

## Open Questions
1. Should `bcrypt` (native binding, faster) or `bcryptjs` (pure JS, no native build step) be used for password hashing?
   - Recommended: use `bcryptjs` — avoids native-module build/platform issues in dev and CI environments, and hashing a single Admin login's password is not performance-sensitive enough to justify the native dependency risk.
2. Should `GET /health` report only "server up" or also reflect live MongoDB connection state, matching `booking-service`'s convention?
   - Recommended: include DB connection state (`{ status: "ok", db: "connected" | "disconnected" }`), matching `booking-service`'s plan 004 pattern for consistency across services.
3. What env var name and default should be used for the MongoDB connection string, and should the server fail to boot or boot-degraded if MongoDB is unreachable at startup?
   - Recommended: use `MONGODB_URI` with a local default (`mongodb://localhost:27017/user-service`) for dev convenience; boot the HTTP server regardless of initial DB connection result (log the error, rely on Mongoose's reconnection), matching `booking-service`'s plan 004 approach so `/health` can report `disconnected` instead of crash-looping.

## Steps
1. `user-service/` — create the folder and run `npm init` (or hand-write `package.json`) to establish the package, name `user-service`.
2. `user-service/package.json` — add `express`, `mongoose`, `jsonwebtoken`, and `bcryptjs` (per Open Question 1) as dependencies; add `nodemon` as a devDependency; add `start` (`node src/server.js`) and `dev` (`nodemon src/server.js`) scripts.
3. `user-service/src/db.js` — create a Mongoose connection module: reads `process.env.MONGODB_URI` (with local default per Open Question 3), calls `mongoose.connect(...)`, exports the connection/mongoose instance and a way to read current `readyState` for the health check.
4. `user-service/src/server.js` — create a minimal Express app: instantiate the app, call the `db.js` connect function on startup, add a `GET /health` route returning `{ status: "ok", db: <connected|disconnected> }` (per Open Question 2) with HTTP 200, listen on `process.env.PORT || <default port distinct from api-gateway's and booking-service's>`.
5. `user-service/.gitignore` — add `node_modules`, `.env`, and any standard Node ignores so installed dependencies and secrets aren't committed.
6. `user-service/` — run `npm install` to generate `package-lock.json`, then start the server locally (with a local MongoDB instance running or reachable) and confirm `GET /health` responds 200 with the expected JSON body, including correct `db` state; confirm `jsonwebtoken` and `bcryptjs` are present in `node_modules` and importable, without wiring them into any route yet.

## Validation
- `user-service/package.json` exists with `express`, `mongoose`, `jsonwebtoken`, and `bcryptjs` listed under `dependencies` and valid `start`/`dev` scripts.
- `user-service/package-lock.json` is generated and committed.
- Running `npm start` (or `npm run dev`) in `user-service/` boots the server without error, with or without MongoDB reachable.
- `curl http://localhost:<port>/health` (or equivalent) returns HTTP 200 with a JSON body indicating healthy server status and current DB connection state.
- Stopping/blocking MongoDB and re-checking `/health` shows `db: disconnected` (or equivalent) rather than crashing the process.
- `require('jsonwebtoken')` and `require('bcryptjs')` resolve without error (e.g. via a quick node -e smoke check), confirming both libraries are correctly installed ahead of the future login-route task.
- No existing folder (`frontend/`, `api-gateway/`, `booking-service/`, or any other service) is modified by this task.

## Risks
- **Auth foundation**: this service will own Admin credentials and JWT issuance for F5, which every Admin route (F6–F11) ultimately depends on via `api-gateway`'s verification (`jwt-middleware-layer`); getting the dependency choices (hashing library, JWT library) or `.env`/secret-handling pattern wrong now sets a template that's hard to change once the login route and `api-gateway` middleware are built on top of it — flagged here so `security` review of this scaffold's dependency and config choices is warranted even though no auth logic ships yet.
- **No route logic yet**: `jsonwebtoken`/`bcryptjs` are installed but unused in this task; a stray or premature route stub could create false confidence that login is implemented — mitigated by keeping Steps/Scope explicit that only the health check is wired.
- **Convention drift**: folder/script/health-check conventions here should match `api-gateway` (plan 003) and `booking-service` (plan 004); mitigated by Open Questions 2–3 explicitly mirroring those prior scaffolds.
- **Port/DB collisions**: reusing `api-gateway`'s or `booking-service`'s default port or `MONGODB_URI` database name could cause local run conflicts; mitigated by choosing a distinct default port and a distinct default database name (`user-service`).
- No `frontend`, `api-gateway`, or `booking-service` code is touched, so they are correctly excluded from Scope-Agents; `qa` is retained to validate the health check boots and correctly reflects DB state, and to smoke-check the new dependencies are importable.

## Rollout Order
1. Create `user-service/package.json` and install `express`/`mongoose`/`jsonwebtoken`/`bcryptjs`/`nodemon` (Steps 1–2).
2. Add `src/db.js` Mongoose connection module (Step 3).
3. Add `src/server.js` with the `/health` route wired to DB state (Step 4).
4. Add `.gitignore`, install, and verify locally including DB-down scenario and dependency import smoke check (Steps 5–6 / Validation).

## Rollback
- Delete the `user-service/` folder entirely. Since no other service or the frontend references `user-service` yet, removal is fully isolated and has no downstream impact.
