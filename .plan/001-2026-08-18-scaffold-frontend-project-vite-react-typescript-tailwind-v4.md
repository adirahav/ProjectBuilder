# Plan 001 — Scaffold frontend project (Vite + React + TypeScript + Tailwind v4)

- Status: active
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: frontend, qa

## Goal
Create the initial `frontend/` project skeleton — Vite + React + TypeScript, Tailwind CSS v4 wired in CSS-first mode, and the base folder/tooling conventions the rest of the frontend work (`css-layer`, `ui-component-layer`, `state-management-layer`, `api-layer`, etc.) will build on. No feature/screen code, no API integration — just a running, lint-clean, empty shell.

## Scope
- In scope: `frontend/` project init (Vite + React + TS template), Tailwind v4 install/config (`@tailwindcss/vite`, `main.css` with `@theme` block per `.rule/style-rules.md`), `cn()` utility (`frontend/src/lib/utils.ts`), base folder structure, TypeScript/ESLint/Prettier config, `package.json` scripts (dev/build/lint/test), a placeholder root route that renders without errors.
- Out of scope: actual screens (service list, booking flow, admin dashboard), API client/auth wiring, i18n (Hebrew/English) content, Capacitor/native setup, state management slices, real theme token tuning beyond the confirmed defaults in `.rule/style-rules.md`.

## Assumptions
- `frontend/` does not yet exist in the repo (confirmed empty at plan time) — this is a fresh scaffold, not a migration.
- Node/npm tooling is available in the dev environment; no specific Node version is pinned elsewhere in the repo, so we'll use current LTS.
- Tailwind v4's CSS-first config (`@tailwindcss/vite`, no `tailwind.config.js`) is mandatory per `.rule/style-rules.md`.
- No design source is provided (`orchestrator.config.json` → `designSource: NONE`); visual design decisions are deferred to the screen-building tasks, not this scaffold.
- A minimal test runner (Vitest, matching the Vite ecosystem) should be installed now so later tasks don't have to add test tooling from scratch.

## Open Questions
1. Should React Router be installed now (empty routes) or deferred to the first screen-building task?
   - Recommended: install now with a single placeholder route — routing is structural, and adding it later touches every screen task's plan unnecessarily.
2. Package manager — npm, pnpm, or yarn?
   - Recommended: npm, since no lockfile/config elsewhere in the repo signals a preference and npm ships with Node by default, minimizing environment setup.
3. Should the frontend live at repo-root `frontend/` as a standalone package, or be wired into a workspace/monorepo tool (e.g. npm workspaces) with `backend/`?
   - Recommended: standalone `frontend/` package for now (matches existing `backend/` sibling layout observed in the repo root); revisit workspaces only if shared tooling pain shows up later.

## Steps
1. `frontend/` — scaffold with `npm create vite@latest frontend -- --template react-ts`.
2. `frontend/` — install Tailwind v4: `tailwindcss`, `@tailwindcss/vite`; wire `@tailwindcss/vite` plugin into `frontend/vite.config.ts`.
3. `frontend/src/main.css` — create with `@import "tailwindcss";` and the `@theme` block exactly as specified in `.rule/style-rules.md` (primary, primary-light, accent, danger, success, warning, neutral-50, neutral-900); import it from `frontend/src/main.tsx`.
4. `frontend/src/lib/utils.ts` — add `cn()` helper using `clsx` + `tailwind-merge` (install both as deps) per `.rule/style-rules.md`.
5. `frontend/` — install and configure React Router (`react-router-dom`) with a single placeholder route (`/`) rendering a minimal "app shell" component, per Open Question 1 recommendation.
6. `frontend/` — set up base folder structure under `frontend/src/`: `components/`, `pages/`, `lib/`, `hooks/`, `store/` (empty placeholders/`.gitkeep` as needed) to match the layered skills (`ui-component-layer`, `state-management-layer`, `page-layer`, `api-layer`).
7. `frontend/` — add ESLint + Prettier config consistent with `.rule/coding-rules.md` and `.rule/naming-rules.md` (confirm those rule files' conventions before finalizing lint rules).
8. `frontend/` — install Vitest + React Testing Library, add a single smoke test (app shell renders) and a `test` script in `package.json`.
9. `frontend/package.json` — ensure scripts: `dev`, `build`, `preview`, `lint`, `test`.
10. `frontend/` — add `.gitignore` (node_modules, dist, .env*) if not already covered by a root `.gitignore`.
11. Root `README.md` or `frontend/README.md` — brief note on how to run the frontend (`npm install && npm run dev`), only if the repo's existing README pattern calls for per-package readmes (check `backend/` for precedent first).

## Validation
- `npm install` completes cleanly in `frontend/`.
- `npm run build` produces a `dist/` output with no TypeScript errors.
- `npm run lint` passes with no errors.
- `npm run test` runs the smoke test successfully (app shell renders without throwing).
- `npm run dev` serves the app locally and the placeholder route renders in-browser (manual/agent check).
- Confirm `frontend/src/main.css` matches the exact token set in `.rule/style-rules.md` (no drift).
- Confirm no `tailwind.config.js` was generated (CSS-first v4 only).

## Risks
- **Tailwind v4 CSS-first setup drift**: v4 tooling defaults can still scaffold a JS config file or v3-style setup depending on template/version pinned; mitigate by explicitly following `.rule/style-rules.md` and removing any auto-generated `tailwind.config.js`.
- **Token drift**: theme tokens hardcoded here could diverge from `.rule/style-rules.md` over time; mitigate by treating that rule file as source of truth and not inventing extra tokens in this task.
- **Scope creep into screen work**: risk of pulling in premature API/auth wiring; mitigated by keeping this task strictly to scaffolding per Scope section.
- No backend/auth/data-integrity risk is introduced by this task — it touches no service code, so `booking-service`, `user-service`, and `notification-service` are correctly excluded from Scope-Agents.

## Rollout Order
1. Scaffold Vite project and verify it builds/runs bare (before Tailwind).
2. Add Tailwind v4 + theme tokens, verify utilities apply.
3. Add `cn()`, router, folder structure.
4. Add lint/test tooling last, once the shape of the app is stable, then run full Validation pass.

## Rollback
- This task only adds a new, currently-nonexistent `frontend/` directory and does not modify any other part of the repo; rollback is `rm -rf frontend/` (or revert the introducing commit) with no side effects elsewhere.
