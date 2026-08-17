# Plan 003 — Install frontend dependencies (Tailwind v4, Zustand, Axios, sonner, lucide-react, framer-motion, jwt-decode)

Status: approved
Owner: orchestrator
Last updated: 2026-08-17
Scope-Agents: none

## Goal
Install the frontend npm dependencies already declared in `frontend/package.json` — Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`), `zustand`, `axios`, `sonner`, `lucide-react`, `framer-motion`, `jwt-decode`, plus their existing peers (`react-router-dom`, `clsx`, `tailwind-merge`) — so the frontend project (scaffolded in Plan 001) has a working `node_modules/` and can build/run without missing-module errors.

## Scope
- In scope: running `npm install` inside `frontend/`, verifying `node_modules/` and `frontend/package-lock.json` are consistent with `frontend/package.json`.
- Out of scope: adding, removing, or changing any dependency version in `frontend/package.json` (all target packages are already declared there per Plan 001's scaffold); writing any application code, Tailwind config, or store/service code that *uses* these libraries; installing dependencies elsewhere (root or `backend/*`, covered by other plans).

## Assumptions
- `frontend/package.json` (created by Plan 001) already lists every target dependency — Tailwind v4, Zustand, Axios, sonner, lucide-react, framer-motion, jwt-decode — under `dependencies`/`devDependencies` with pinned semver ranges, so this task is a pure install, not a dependency-selection task.
- npm is the package manager in use (matches existing `frontend/package-lock.json`).
- `frontend/node_modules` may already exist from Plan 001's scaffold step; this task's job is to ensure it's fully populated and lockfile-consistent, re-running install if needed.
- No Tailwind config wiring, PostCSS setup, or CSS entrypoint changes are performed here — that's application/UI work for a later task under the `css-layer` skill.

## Open Questions
1. Since all target packages are already in `frontend/package.json`, is a plain `npm install` sufficient, or should versions be re-pinned/upgraded as part of this task?
   - Recommended: plain `npm install` only — version selection was already decided when Plan 001 scaffolded `frontend/package.json`; re-pinning is out of scope and would blur task boundaries.
   - *HUMAN ANSWER*: as recommended
   
## Steps
1. `frontend/`: run `npm install` to install all declared dependencies and devDependencies (Tailwind v4, Zustand, Axios, sonner, lucide-react, framer-motion, jwt-decode, and their peers).
2. `frontend/`: confirm `node_modules/` contains each target package (`tailwindcss`, `@tailwindcss/vite`, `zustand`, `axios`, `sonner`, `lucide-react`, `framer-motion`, `jwt-decode`).
3. `frontend/`: confirm `package-lock.json` remains consistent (no unexpected diff since no versions are being changed).

## Validation
- `npm install` inside `frontend/` exits with code 0 and no errors.
- Each target package directory exists under `frontend/node_modules/` (spot-check `tailwindcss`, `zustand`, `axios`, `sonner`, `lucide-react`, `framer-motion`, `jwt-decode`, `@tailwindcss/vite`).
- `git diff -- frontend/package-lock.json` shows no unintended version changes.
- `npm run build` (or `npx tsc -b --noEmit`) inside `frontend/` does not fail with a "module not found" error for any of the installed packages.

## Risks
- Low risk: pure dependency-install task with no product code, no API, no auth, and no data changes — no backend service is touched and no `Scope-Agents` beyond `none` is warranted.
- Stale or divergent `frontend/package-lock.json` could cause `npm install` to modify the lockfile unexpectedly; mitigated by checking `git diff` after install (Validation step).
- Tailwind v4's `@tailwindcss/vite` plugin requires corresponding `vite.config.ts` wiring to actually take effect — not installing it correctly would only surface later, in UI work; this task only guarantees the package is present, not wired.

## Rollout Order
1. Run `npm install` inside `frontend/`.
2. Verify `node_modules/` contents and lockfile state.
3. Sanity-check the frontend build/type-check does not fail on missing modules.

## Rollback
- Delete `frontend/node_modules/`; `frontend/package.json` and `frontend/package-lock.json` are unaffected since no versions are changed, so rollback is a clean, no-risk removal.