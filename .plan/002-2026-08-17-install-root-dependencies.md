# Plan 002 — Install root dependencies

Status: done
Owner: orchestrator
Last updated: 2026-08-17
Scope-Agents: none

## Goal
Install the npm dependencies declared in the repository root `package.json` (currently just `dotenv`, used by `scripts/dev-loop.js`, the multi-agent orchestrator) so the root-level orchestrator tooling runs without missing-module errors.

## Scope
- In scope: running `npm install` at the repository root, verifying `node_modules/` and `package-lock.json` are consistent with `package.json`.
- Out of scope: installing dependencies inside `frontend/`, `backend/*`, or any other sub-project (each has its own `package.json`/lockfile and is installed independently); adding/removing/upgrading any dependency versions; any application/product code changes.

## Assumptions
- The root `package.json` (name: `reference-app`) exists solely to host `scripts/dev-loop.js` (the orchestrator) and is not part of the BookMe product (frontend/booking-service/admin-service) itself.
- No new dependency needs to be added — this task only installs what's already declared (`dotenv`).
- npm is the package manager in use at root (matches existing `package-lock.json`).
- Node version: whatever is already available in the environment (no `.nvmrc` pinning required for this task).

## Open Questions
1. Should this task also run installs in `frontend/` and each `backend/*` sub-project, or strictly root-only?
   - Recommended: strictly root-only — sub-projects have their own install steps (already done for `frontend/` per Plan 001, and future backend scaffolding tasks will own their own installs). Bundling them here would blur task boundaries and re-run installs that belong to other plans.
   - *HUMAN ANSWER*: as recommended
   
## Steps
1. Repo root (`/`): run `npm install` to install dependencies from the root `package.json` (`dotenv`).
2. Repo root (`/`): confirm `node_modules/` is created/updated and `package-lock.json` remains consistent (no unexpected diff since no versions are being changed).
3. Repo root (`/`): sanity-check `scripts/dev-loop.js` can `require`/`import` `dotenv` without a "module not found" error.

## Validation
- `npm install` at repo root exits with code 0 and no errors.
- `node_modules/dotenv` exists at repo root after install.
- `git diff -- package-lock.json` shows no unintended version changes (install should be a no-op against the existing lockfile unless it was out of date).
- `node scripts/dev-loop.js --help` (or equivalent no-op invocation) does not fail on a missing `dotenv` module.

## Risks
- Low risk: this is a pure tooling/dependency-install task with no product code, no API, no auth, and no data changes — it does not touch `frontend`, `booking-service`, `admin-service`, or any security-sensitive surface.
- Stale or divergent `package-lock.json` could cause `npm install` to modify the lockfile unexpectedly; mitigated by checking `git diff` after install (Validation step).

## Rollout Order
1. Run `npm install` at repo root.
2. Verify `node_modules/` and lockfile state.
3. Sanity-check `scripts/dev-loop.js` loads its dependency.

## Rollback
- Delete the root `node_modules/` directory; `package.json` and `package-lock.json` are unaffected since no versions are changed, so rollback is a clean, no-risk removal.
