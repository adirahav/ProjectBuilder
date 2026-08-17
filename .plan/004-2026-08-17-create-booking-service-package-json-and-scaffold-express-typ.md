# Plan 004 — Create booking-service package.json and scaffold (Express, TypeScript, Mongoose)

Status: done
Owner: orchestrator
Last updated: 2026-08-17
Scope-Agents: booking-service, qa

## Goal
Scaffold the `backend/booking-service` package so it is a runnable, empty-but-correct Express + TypeScript + Mongoose service: `package.json`, TypeScript config, folder structure, a minimal Express app with a health-check route, and a Mongoose connection helper — with no product endpoints yet (those come in later plans per F1–F4, F6–F11).

## Scope
- In scope:
  - `backend/booking-service/package.json` (name, scripts, dependencies, devDependencies).
  - `backend/booking-service/tsconfig.json`.
  - `backend/booking-service/src/index.ts` (process entrypoint: loads env, connects Mongo, starts server).
  - `backend/booking-service/src/app.ts` (Express app factory: middleware, `GET /health`, error handler).
  - `backend/booking-service/src/config/` (env/config loader, Mongoose connection helper).
  - Baseline folder scaffolding for later layers: `src/routes/`, `src/controllers/`, `src/models/`, `src/services/` (empty/placeholder, per `service-layer` and `mongoose-models-layer` skills), each with a `.gitkeep` or index stub so the tree exists.
  - `.gitignore` entries for `node_modules/`, `dist/`, and local environment files (if not already covered by a root `.gitignore`).
  - Installing declared dependencies (`npm install` inside `backend/booking-service`).
- Out of scope:
  - Any real API route logic (F1–F4, F6–F11) — those are separate future plans.
  - Mongoose schemas/models for `Service`, `TimeSlot`, `Appointment` (separate plan, per `mongoose-models-layer` skill).
  - Auth/JWT middleware implementation (separate plan, per `jwt-middleware-layer` skill; login itself lives in `admin-service` per F5).
  - `admin-service` scaffold (separate task/plan).
  - Frontend integration (`api-layer` skill, separate plan).
  - Deploying or wiring this service into any root-level orchestration script beyond what's needed for it to run standalone.

## Assumptions
- `backend/booking-service/` currently has no `package.json` (confirmed) — only a stray `node_modules/` directory and a local, gitignored environment file left over from prior work; this task adds the missing manifest and config rather than modifying an existing app.
- Package manager: npm (matches root and `backend/package.json`, which use `package-lock.json`).
- Runtime: Node.js with `"type": "module"` + native TypeScript compilation via `tsc`, run in dev via `tsx` — chosen for fast iteration; final choice left to the implementing agent unless flagged in Open Questions below.
- Mongoose connects to a local/dev MongoDB via a `MONGODB_URI` environment variable loaded through `dotenv`, consistent with the local environment file already present in this folder (untouched by this task — no secrets are read or written by the plan itself).
- Test runner: Vitest (already present in `node_modules` in this folder, and used elsewhere in the reference scaffolding), wired with an empty/smoke test only — full test coverage is out of scope for a scaffold task.
- This service is NOT added as an npm workspace member of `backend/package.json` in this task (that file currently references an unrelated template's services — `user-management-service`, `tour-service`, `common-service` — which is itself stale/out of scope to fix here); `booking-service` will run standalone via its own `npm run dev`/`npm start` inside its folder.

## Open Questions
1. Should `backend/package.json`'s stale `workspaces`/`scripts` (referencing `user-management-service`, `tour-service`, `common-service`) be cleaned up to include `booking-service` as part of this task?
   - Recommended: no — leave `backend/package.json` untouched in this task; fixing the root backend orchestration file is a separate, cross-cutting task once `admin-service` also exists, so `booking-service` should be independently runnable first.
   - *HUMAN ANSWER*: as recommended
2. Dev-mode TypeScript runner: `tsx` vs `ts-node-dev` vs plain `tsc -w` + `node --watch`?
   - Recommended: `tsx` — fastest startup, ESM-native, minimal config, already the common modern choice for new Express+TS services.
   - *HUMAN ANSWER*: as recommended
3. Should the stray existing `backend/booking-service/node_modules/` be deleted and reinstalled fresh, or reused as-is?
   - Recommended: delete and run a clean `npm install` after `package.json` is written, so the lockfile and `node_modules/` are guaranteed consistent with the new manifest rather than inheriting an unknown prior state.
   - *HUMAN ANSWER*: as recommended

## Steps
1. `backend/booking-service/`: write `package.json` with `"type": "module"`, `name: "booking-service"`, scripts (`dev`, `build`, `start`, `test`), dependencies (`express`, `mongoose`, `cors`, `dotenv`), and devDependencies (`typescript`, `tsx`, `@types/express`, `@types/node`, `@types/cors`, `vitest`).
2. `backend/booking-service/`: write `tsconfig.json` (target ES2022+, module NodeNext, strict mode, `outDir: dist`, `rootDir: src`).
3. `backend/booking-service/src/config/`: add `env.ts` (loads/validates required environment variables via `dotenv`) and `db.ts` (Mongoose `connect()` helper with basic error handling).
4. `backend/booking-service/src/`: add `app.ts` (Express instance, `cors()`, `express.json()`, `GET /health` → `200 { status: "ok" }`, 404 handler, basic error-handling middleware) and `index.ts` (imports `app.ts`, calls `connectDB()`, then `app.listen(PORT)`).
5. `backend/booking-service/src/`: create placeholder subfolders `routes/`, `controllers/`, `models/`, `services/` (each with a minimal stub/index so git tracks the empty directory) to establish the layout the later layer-specific plans will fill in.
6. `backend/booking-service/`: add/update `.gitignore` for `node_modules/`, `dist/`, and local environment files, if not already covered.
7. `backend/booking-service/`: remove the stray pre-existing `node_modules/` and run `npm install` to produce a fresh `package-lock.json` matching the new `package.json`.
8. `backend/booking-service/`: add a minimal Vitest smoke test (e.g. `src/app.test.ts` hitting `GET /health`) to prove the harness works end to end.

## Validation
- `npm install` inside `backend/booking-service` exits 0 and produces `package-lock.json`.
- `npm run build` (tsc) compiles without type errors.
- `npm run dev` starts the server and `GET /health` returns `200 { status: "ok" }` (manually or via the smoke test).
- `npm test` runs the Vitest smoke test successfully.
- `npx tsc --noEmit` reports no errors under `strict: true`.

## Risks
- Low risk overall — this is scaffolding with no business logic, auth, or PII handling yet.
- Stray pre-existing `node_modules/` in the target folder could mask a broken/incomplete install if not cleaned before the fresh `npm install` (Step 7 mitigates this).
- Mongoose connection setup touches a config/integration point (database credentials via environment variables); kept minimal and dev-only in this task, but worth flagging for the `security` agent in a later plan once real credentials/deployment config are introduced — not required for this scaffold-only task.
- Divergence between this service's own `package.json` and the stale `backend/package.json` workspace config could confuse future contributors; documented in Assumptions/Open Questions rather than silently fixed, to avoid scope creep.

## Rollout Order
1. Write `package.json` and `tsconfig.json`.
2. Add `src/config/`, `src/app.ts`, `src/index.ts`.
3. Add placeholder `routes/`, `controllers/`, `models/`, `services/` folders.
4. Update `.gitignore`.
5. Clean stray `node_modules/`, run fresh `npm install`.
6. Add smoke test, run full Validation checklist.

## Rollback
- Delete `backend/booking-service/package.json`, `tsconfig.json`, `package-lock.json`, `node_modules/`, and the newly-added `src/` files/folders created in this task; the folder returns to its prior (effectively empty) state with no impact on `frontend/` or any other backend service.
