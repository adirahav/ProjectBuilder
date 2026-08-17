# Plan 001 — Create frontend project (Vite + React + TypeScript)

Status: done
Owner: orchestrator
Last updated: 2026-08-17
Scope-Agents: frontend, qa

## Goal
Scaffold the BookMe frontend as a new Vite + React + TypeScript project so subsequent feature work (services list, timeslot picker, booking flow, admin dashboard) has a working, buildable, lintable base to build on.

## Scope
- In scope: creating the frontend project skeleton under `frontend/` (Vite + React + TS template), base tooling config (TypeScript, ESLint, Prettier if used, `.gitignore`, `package.json` scripts), baseline folder structure for future layers (components, pages, state, api, styles), Tailwind CSS setup per `css-layer` skill, and RTL/Hebrew base config per `css-layer`/`accessibility-layer` skills.
- Out of scope: implementing any actual screens/features (Screens 1–7), API integration, auth, routing details beyond a minimal placeholder, state management slices, and backend/admin-service work.

## Assumptions
- The frontend lives in a new top-level `frontend/` folder in this repo (monorepo-style alongside future `booking-service/`, `admin-service/`).
- Package manager: npm (repo has no existing lockfile/convention to follow).
- React Router will be added now as a base dependency since multiple screens/navigation are core to the PRD, but only a placeholder route structure is created in this task.
- Tailwind CSS is installed and configured now (per `css-layer` skill) since it's the mandated styling approach for all UI work, even though no real UI is built yet.
- Hebrew/RTL is set as the default `dir="rtl"` / `lang="he"` in `index.html` per NFR, even though no translated content exists yet.
- Node version: use whatever LTS is available in the environment; no `.nvmrc` pinning unless requested.

## Open Questions
1. Should the frontend live at repo root as `frontend/`, or in a different monorepo layout (e.g. `apps/frontend`)?
   - Recommended: use `frontend/` at repo root — simplest, matches the PRD's implied per-service top-level folder pattern (`booking-service`, `admin-service`).
   - *HUMAN ANSWER*: as recommended
2. Should React Router be installed in this scaffolding task, or deferred to the first page-routing task?
   - Recommended: install it now with a minimal placeholder route, since nearly every subsequent frontend task depends on routing existing.
   - *HUMAN ANSWER*: as recommended
3. Should Tailwind be configured now vs. in a later "styling setup" task?
   - Recommended: configure it now per `css-layer` skill, since it's the mandated styling approach and doing it here avoids every future UI task re-deriving config.
   - *HUMAN ANSWER*: as recommended

## Steps
1. `frontend/`: scaffold project with `npm create vite@latest . -- --template react-ts` (or equivalent) inside a new `frontend/` folder.
2. `frontend/`: install and configure Tailwind CSS (per `css-layer` skill) — `tailwind.config`, PostCSS config, base stylesheet import.
3. `frontend/`: set `index.html` `<html>` to `dir="rtl" lang="he"`, per NFR (Hebrew/RTL single-language v1).
4. `frontend/`: install `react-router-dom` and add a minimal `App` with a placeholder route/layout (no real screens yet).
5. `frontend/`: create baseline folder structure: `src/components/`, `src/pages/`, `src/api/`, `src/state/`, `src/styles/`.
6. `frontend/`: configure ESLint + TypeScript strict mode; add `.gitignore` (node_modules, dist, env files).
7. `frontend/`: add `package.json` scripts: `dev`, `build`, `lint`, `preview`.
8. Verify project builds (`npm run build`) and dev server starts (`npm run dev`) cleanly with no errors.

## Validation
- `npm install` completes without errors in `frontend/`.
- `npm run build` succeeds and produces a `dist/` output.
- `npm run dev` starts the Vite dev server and serves a blank/placeholder page with `dir="rtl"`.
- `npm run lint` passes with no errors on the scaffolded code.
- QA agent confirms the project structure matches this plan's Steps and no unrelated screens/features were implemented prematurely.

## Risks
- Wrong folder layout chosen now (e.g. `frontend/` vs `apps/frontend`) could require rework later if other services adopt a different monorepo convention — mitigated by flagging as Open Question 1.
- Installing Tailwind/RTL config incorrectly could force rework across all future UI tasks — kept low-risk by keeping this task's styling scope minimal (base config only, no components).
- No backend or auth code is touched by this task, so no `booking-service`, `admin-service`, or `security` risk applies.

## Rollout Order
1. Scaffold Vite + React + TS project in `frontend/`.
2. Add Tailwind + RTL base config.
3. Add router + folder structure + tooling scripts.
4. Validate build/dev/lint.

## Rollback
- Delete the `frontend/` folder entirely; no other part of the repo depends on it yet, so rollback is a clean removal with no data or migration concerns.
