# Plan 003 — Install frontend dependencies (Tailwind v4, Zustand, Axios, sonner, lucide-react, framer-motion, jwt-decode)

Status: draft
Owner: orchestrator
Last updated: 2026-08-17
Scope-Agents: none

## Goal
Install the npm dependencies already declared in `frontend/package.json` (Tailwind v4 via `@tailwindcss/vite`, `zustand`, `axios`, `sonner`, `lucide-react`, `framer-motion`, `jwt-decode`, plus `react-router-dom`, `clsx`, `tailwind-merge`) so the frontend project scaffolded in Plan 001 has a working `node_modules/` and can build/run.

## Scope
- In scope: running `npm install` inside `frontend/`, verifying `frontend/node_modules/` and `frontend/package-lock.json` are consistent with `frontend/package.json`, sanity-checking the dev server / build starts without missing-module errors.
- Out of scope: adding, removing, or upgrading any dependency versions (all target packages are already listed in `frontend/package.json` per Plan 001's scaffold); writing any application/product code (components, stores, routes); configuring Tailwind's theme/tokens (that belongs to `css-layer`-driven UI work); installing dependencies in `backend/*` or repo root (covered by other plans).

## Assumptions
- `frontend/package.json` already lists all required packages (confirmed: `axios`, `clsx`, `framer-motion`, `jwt-decode`, `lucide-react`, `react-router-dom`, `sonner`, `tailwind-merge`, `zustand` as dependencies; `@tailwindcss/vite`, `tailwindcss` as devDependencies) — this task installs them, it does not add them.
- npm is the package manager in use for `frontend/` (matches existing `frontend/package-lock.json`).
- Node version is whatever is already available in the environment; no new `.nvmrc` pinning is introduced by this task.
- This is a pure dependency-install task with no product/API code changes, matching the pattern of Plan 002.

## Open Questions
1. Should Tailwind's CSS entry (`@import "tailwindcss"` in the main stylesheet) and `vite.config.ts` plugin wiring be verified/added as part of this task, or left strictly to a later UI-layer task?
   - Recommended: verify only that the packages installed correctly (e.g. `@tailwindcss/vite` resolves); leave actual CSS/theme wiring to the `css-layer` skill work in a dedicated UI setup plan, keeping this task a pure install step.

## Steps
1. `frontend/`: run `npm install` to install all dependencies and devDependencies declared in `frontend/package.json`.
2. `frontend/`: confirm `frontend/node_modules/` is created/updated and `frontend/package-lock.json` remains consistent (no unexpected version diffs since no versions are being changed).
3. `frontend/`: spot-check that the target packages resolve, e.g. `node -e "require.resolve('axios'); require.resolve('zustand')"` or equivalent, and that `@tailwindcss/vite`, `sonner`, `lucide-react`, `framer-motion`, `jwt-decode` are present under `frontend/node_modules/`.
4. `frontend/`: run `npm run build` (or `vite --version` / a quick `npm run dev` smoke start) to confirm the toolchain (Vite + Tailwind v4 plugin + TypeScript) loads without missing-module errors.

## Validation
- `npm install` in `frontend/` exits with code 0 and no errors.
- `frontend/node_modules/` contains `axios`, `zustand`, `sonner`, `lucide-react`, `framer-motion`, `jwt-decode`, `@tailwindcss/vite`, `tailwindcss`, `react-router-dom`, `clsx`, `tailwind-merge`.
- `git diff -- frontend/package-lock.json` shows no unintended version changes.
- `npm run build` (or a dev-server smoke start) in `frontend/` completes without "module not found" errors.

## Risks
- Low risk: pure tooling/dependency-install task with no product code, no API changes, no auth, and no data changes — does not touch `booking-service` or `admin-service`, and introduces no new attack surface.
- Stale or divergent `frontend/package-lock.json` could cause `npm install` to modify the lockfile unexpectedly; mitigated by checking `git diff` after install (Validation step).
- Tailwind v4's plugin-based setup (`@tailwindcss/vite`) differs from v3's PostCSS config; if a later task assumes v3-style config it will fail — flagged here so the follow-up CSS-wiring task is aware, but no config changes are made in this task.

## Rollout Order
1. Run `npm install` in `frontend/`.
2. Verify `frontend/node_modules/` and lockfile state.
3. Smoke-check the build/dev toolchain loads all installed packages.

## Rollback
- Delete `frontend/node_modules/`; `frontend/package.json` and `frontend/package-lock.json` are unaffected since no versions are changed, so rollback is a clean, no-risk removal.
