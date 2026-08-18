# Plan 002 — Install root and frontend dependencies (Zustand, Axios, lucide-react, sonner, framer-motion, clsx, tailwind-merge)

- Status: active
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: frontend

## Goal
Install the core application-layer npm dependencies — `zustand`, `axios`, `lucide-react`, `sonner`, `framer-motion`, `clsx`, `tailwind-merge` — into `frontend/`, so the upcoming screen/state/API tasks (`state-management-layer`, `api-layer`, `ui-component-layer`, `css-layer`) have their required libraries already present instead of each feature task ad-hoc installing packages. Pure dependency installation — no feature code, no new components, no config beyond what's needed to confirm the packages resolve.

## Scope
- In scope: adding the listed packages to `frontend/package.json` (dependencies) via npm install, verifying they resolve and the project still builds/lints, confirming no duplicate/conflicting installs with what plan 001 already set up (`clsx` + `tailwind-merge` were installed in plan 001 step 4 for `cn()` — this task confirms/re-verifies rather than re-installing).
- Out of scope: writing any Zustand store slices, Axios client/instance setup, wiring `sonner` toasts into the app shell, using `lucide-react` icons in components, or building any `framer-motion` animations. Those are implementation tasks for later plans (`state-management-layer`, `api-layer`, `ui-component-layer` respectively).
- Root-level scope: the task title mentions "root and frontend dependencies" — this repo has no root-level `package.json` observed outside `frontend/` and `backend/` (each a standalone package per plan 001's Open Question 3 answer), so "root" here is interpreted as "the frontend package root" (`frontend/package.json`), not a monorepo root. See Open Questions.

## Assumptions
- `frontend/` already exists and was scaffolded per plan 001 (Vite + React + TS + Tailwind v4), including `clsx` and `tailwind-merge` already added for the `cn()` utility.
- No backend equivalent of these dependencies is implied — `axios`, `zustand`, `lucide-react`, `sonner`, `framer-motion` are frontend-only libraries; nothing here touches `backend/`.
- npm is the package manager (per plan 001 Open Question 2 answer).
- No version pins are mandated elsewhere in the repo; latest stable of each package at install time is acceptable unless it introduces a peer-dependency conflict with the installed React/Vite versions.

## Open Questions
1. Does "root" in the task title mean a monorepo root `package.json`, or is it a loose reference to `frontend/` being the app root?
   - Recommended: treat it as `frontend/` (the app root) — no monorepo/workspace root `package.json` exists in this repo per plan 001, and this task's own package list (Zustand, Axios, UI/animation libs) is entirely frontend-consumed.
2. Should `clsx`/`tailwind-merge` be reinstalled/re-pinned even though plan 001 already added them?
   - Recommended: no — just verify they're present in `frontend/package.json` from plan 001; re-running `npm install clsx tailwind-merge` is harmless but redundant, so only do it if they're found missing.
3. Should exact versions be pinned in this plan, or left to "latest stable at install time"?
   - Recommended: leave to latest stable resolved by npm at install time (consistent with plan 001's approach), recorded as whatever lands in `package-lock.json`.

## Steps
1. `frontend/` — confirm current `package.json` dependencies (check for `clsx`, `tailwind-merge` already present from plan 001).
2. `frontend/` — run `npm install zustand axios lucide-react sonner framer-motion` to add the five new runtime dependencies.
3. `frontend/` — if `clsx` and/or `tailwind-merge` are missing (contrary to Assumptions), run `npm install clsx tailwind-merge` to add them too.
4. `frontend/package.json` / `frontend/package-lock.json` — verify all seven packages appear under `dependencies` with resolved versions committed via the lockfile.
5. `frontend/` — run a build to confirm no peer-dependency or resolution errors were introduced.

## Validation
- `frontend/package.json` lists `zustand`, `axios`, `lucide-react`, `sonner`, `framer-motion`, `clsx`, `tailwind-merge` under `dependencies`.
- `frontend/package-lock.json` is updated and committed alongside `package.json`.
- `npm install` in `frontend/` completes cleanly with no unresolved peer dependency errors.
- `npm run build` in `frontend/` still succeeds (no import/type errors introduced by the new packages at install time, since none are imported yet).
- `npm run lint` in `frontend/` still passes.

## Risks
- **Peer dependency conflicts**: `framer-motion` or `sonner` could have React version peer requirements that conflict with the React version scaffolded in plan 001; mitigate by checking `npm install` output for peer-dep warnings/errors and resolving before marking done.
- **Redundant/conflicting install of `clsx`/`tailwind-merge`**: since plan 001 already installed these, a careless re-install could bump versions unexpectedly; mitigate via Step 1 (check first) and Step 3 (only install if actually missing).
- **Scope creep**: temptation to start wiring Zustand stores or an Axios instance while "already in the file"; mitigated by Scope section explicitly deferring that to `state-management-layer`/`api-layer` tasks.
- No backend, auth, or data-integrity risk: this task adds no server code and no new endpoints, so `booking-service`, `user-service`, and `notification-service` are correctly excluded from Scope-Agents. `qa` is intentionally excluded per the planning rule's exception for dependency-install tasks with nothing functional to validate.

## Rollout Order
1. Verify existing `frontend/package.json` state (Step 1).
2. Install new dependencies (Step 2, and Step 3 if needed).
3. Verify lockfile + build + lint (Steps 4–5 / Validation).

## Rollback
- Revert the commit that updated `frontend/package.json` and `frontend/package-lock.json`, then run `npm install` in `frontend/` to restore the prior `node_modules` state. No other part of the repo is touched.
