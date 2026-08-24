# Plan 004 — Install root/frontend/backend dependencies

Status: done
Owner: orchestrator
Last updated: 2026-08-24
Scope-Agents: none

## Goal
Run `npm install` (or equivalent) in each already-scaffolded project — repo root (if it has its own manifest), `frontend/`, `backend/tour-service/`, `backend/user-management-service/` — so `node_modules` exist and all three projects (per plans 001–003) can actually build, run, and be tested, with a working lockfile committed for each.

## Scope
- In scope: installing dependencies declared in the existing `package.json` files at repo root (if present), `frontend/package.json`, `backend/tour-service/package.json`, `backend/user-management-service/package.json`; generating/committing the resulting lockfiles (`package-lock.json`); verifying each project's install completes without errors and its existing scripts (`dev`/`build`/`test`) can at least be invoked (not full test-suite validation, which belongs to `qa`/service-owning agents).
- Out of scope: adding, removing, or upgrading any dependency versions beyond what plans 001–003 already specified; writing or modifying any application code, routes, models, or components; running full test suites or starting long-lived dev servers; creating a root `package.json` if one doesn't already exist (flag in the report instead — plan 002 notes `backend/package.json` is a forbidden path for the backend agent, so this plan only touches it if it already exists as a scaffold artifact).

## Assumptions
- Plans 001, 002, 003 have already scaffolded `frontend/`, `backend/tour-service/`, and `backend/user-management-service/` with valid `package.json` files but did not necessarily run `npm install` as a final step (or did, and this ticket re-confirms/repairs `node_modules` state after further scaffold edits).
- Node.js (LTS) and npm are available in the environment; no other package manager (yarn/pnpm) is in use per prior plans' use of `npm init`/`npm --prefix`.
- No network-restricted environment issue is expected; if `npm install` fails due to registry access, that is reported as a blocker rather than worked around.
- This is pure tooling/dependency-install work with no product code changes, so no `frontend`/`tour-service`/`user-management-service`/`security` agent scope applies; `qa` is also omitted since there is no new behavior to validate beyond "install succeeded," per the planning-rules exception for dependency-install tasks.

## Open Questions
1. Does a repo-root `package.json` already exist (e.g., as a workspace root or shared tooling manifest), or is root install a no-op?
- Recommended: check for `package.json` at repo root before running `npm install` there; if absent, skip root install entirely and note it in the report rather than creating a new root manifest (creating one is a structural decision outside this ticket's scope).

2. Should lockfiles (`package-lock.json`) be committed as part of this ticket?
- Recommended: yes — commit the lockfile generated in each project directory alongside the install, since reproducible installs across environments depend on it and no prior plan already committed one.

## Steps
1. Repo root (`./`): check whether `package.json` exists; if yes, run `npm install`; if no, skip and note in report.
2. `frontend/`: run `npm install`; confirm `node_modules/` is created and `package-lock.json` is generated/updated.
3. `backend/tour-service/`: run `npm install`; confirm `node_modules/` is created and `package-lock.json` is generated/updated.
4. `backend/user-management-service/`: run `npm install`; confirm `node_modules/` is created and `package-lock.json` is generated/updated.
5. For each of the three (or four) projects, run a lightweight sanity check that the install is usable — e.g. `npm ls --depth=0` in each directory to confirm no missing/unresolved dependency errors.
6. Commit the generated/updated lockfiles for each project.

## Validation
- `npm ls --depth=0` exits cleanly (no `UNMET DEPENDENCY` errors) in `frontend/`, `backend/tour-service/`, `backend/user-management-service/`, and repo root (if applicable).
- `node_modules/` present in each installed project directory.
- `package-lock.json` present and staged for commit in each installed project directory.
- No application code, `package.json` dependency lists, or scripts were modified by this ticket — only lockfiles and `node_modules` (gitignored) changed.

## Risks
- If any project's `package.json` has a version conflict or a dependency that fails to resolve, the install will surface it now rather than at first `npm run dev`/`test` invocation by a feature ticket — treat any such failure as a blocker to report back, not something to silently patch by changing versions (that's a scope decision for the plan that owns the affected service).
- Lockfile drift risk: if `frontend`/`tour-service`/`user-management-service` `package.json` files are edited again by later tickets before this install is run, this plan's lockfiles will need regenerating — no action needed now, just a note for future scaffold-adjacent tickets.
- No security-sensitive code is touched (pure dependency install), so `security` is correctly excluded from Scope-Agents.

## Rollout Order
1. Repo root install check (step 1).
2. `frontend/` install (step 2).
3. `backend/tour-service/` install (step 3).
4. `backend/user-management-service/` install (step 4).
5. Sanity checks + lockfile commit (steps 5–6).

## Rollback
Delete each project's `node_modules/` directory and revert the corresponding `package-lock.json` to its prior committed state (or remove it if it didn't previously exist) — no application code is modified by this ticket, so rollback is limited to install artifacts.
