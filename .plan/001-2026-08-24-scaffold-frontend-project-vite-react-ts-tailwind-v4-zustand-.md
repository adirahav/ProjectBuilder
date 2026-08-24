# Plan 001 — Scaffold frontend project (Vite + React + TS + Tailwind v4 + Zustand + Lucide React)

Status: done
Owner: orchestrator
Last updated: 2026-08-24
Scope-Agents: frontend, qa

## Goal
Stand up the empty `frontend/` project skeleton so subsequent feature tickets (Gateway/Login, Passenger View, Admin Dashboard, etc.) can build on a consistent, already-configured base: Vite + React + TypeScript + Tailwind CSS v4 (RTL/Hebrew) + Zustand + Lucide React, matching the conventions already documented in `agents/frontend/CLAUDE.md` and `.rule/style-rules.md`.

## Scope
- In scope: creating the `frontend/` app via Vite's React-TS template, installing and wiring Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first, no `tailwind.config.js`), Zustand, Lucide React, `clsx` + `tailwind-merge`; establishing the baseline folder structure (`src/pages`, `src/services`, `src/store/slices`, `src/hooks`, `src/types`, `src/utils`, `src/lib`); baseline `main.css` with an empty/placeholder `@theme` block per `.rule/style-rules.md`; RTL/Hebrew document setup (`dir="rtl"`, `lang="he"`); `src/lib/utils.ts` (`cn()` helper); `src/services/http.service.ts` skeleton; `src/utils/logger.ts` skeleton; base `App.tsx` routing shell; npm scripts (dev/build/lint); no test framework setup yet (deferred — no tests are required by this ticket per `.rule/testing-rules.md`, since there is no app logic yet to test).
- Out of scope: any actual screens/features (Gateway, Passenger View, Admin Dashboard), API contracts, backend work, Capacitor/native Android wiring, real design tokens (mockups don't exist yet — `docs/design/mockups/` is empty), authentication, test framework installation.

## Assumptions
- `docs/design/mockups/` does not yet exist / has no approved mockups, so `main.css`'s `@theme` block ships with TBD placeholder tokens per `.rule/style-rules.md`, to be filled in by a later design-integration ticket.
- Node.js and npm are available in the environment used to run `npm create vite@latest`.
- No `frontend/` directory currently exists (confirmed empty).
- This is pure scaffolding: no product/business logic, so no OpenAPI contract files are produced by this ticket.
- Capacitor/native Android setup is a separate, later ticket — not part of this scaffold.

## Open Questions
1. Should package manager be npm (per `agents/frontend/CLAUDE.md`'s `npm --prefix frontend run <script>` convention) or is pnpm/yarn acceptable?
- Recommended: npm, since `agents/frontend/CLAUDE.md` explicitly documents `npm --prefix frontend run <script>` as the invocation convention.

2. Should ESLint/Prettier be configured as part of this scaffold, or deferred to a later ticket?
- Recommended: include Vite's default ESLint (React+TS template ships with it) but defer any custom Prettier/lint-rule tuning to a later ticket — keeps this ticket focused on scaffolding only.

3. Should a placeholder `App.tsx` include a router (e.g. `react-router-dom`) even though no pages exist yet?
- Recommended: yes, install and wire a minimal `react-router-dom` shell with one placeholder route, since `agents/frontend/CLAUDE.md` Step 3.5 references "wiring routing in `App.tsx`" as an established convention that later tickets will extend rather than introduce.

## Steps
All steps operate in repo-relative folder: `frontend/`.

1. `frontend/`: Run `npm create vite@latest frontend -- --template react-ts` from repo root (or equivalent non-interactive invocation) to scaffold the base Vite+React+TS project.
2. `frontend/`: `npm install` to pull in base dependencies.
3. `frontend/`: Install Tailwind v4 for Vite: `npm install tailwindcss @tailwindcss/vite`; register the `@tailwindcss/vite` plugin in `frontend/vite.config.ts`; no `tailwind.config.js` (CSS-first v4 config).
4. `frontend/src/main.css`: create with `@import "tailwindcss";` plus a placeholder `@theme` block containing the token names listed in `.rule/style-rules.md` (colors, seat-status colors) marked TBD; import this file from `frontend/src/main.tsx`.
5. `frontend/index.html`: set `<html dir="rtl" lang="he">` per `.rule/style-rules.md` RTL/Hebrew requirement.
6. `frontend/`: Install `zustand`, `lucide-react`, `clsx`, `tailwind-merge`.
7. `frontend/src/lib/utils.ts`: add the `cn()` helper (clsx + tailwind-merge) exactly as documented in `.rule/style-rules.md`.
8. `frontend/`: Install `react-router-dom`; create `frontend/src/App.tsx` with a minimal router shell and one placeholder route (e.g. a temporary home page) — see Open Question 3.
9. Create baseline empty-but-present folders/files establishing the layering convention from `agents/frontend/CLAUDE.md`: `frontend/src/pages/`, `frontend/src/services/http.service.ts` (skeleton fetch wrapper, no endpoints yet), `frontend/src/store/slices/` (empty, plus `frontend/src/store/store.ts` skeleton assembling zero slices), `frontend/src/hooks/`, `frontend/src/types/`, `frontend/src/utils/logger.ts` (tagged-console-log interceptor skeleton per `.rule/error-handling-rules.md`).
10. `frontend/package.json`: verify/adjust `dev`, `build`, `lint`, `preview` scripts are present and correct for `npm --prefix frontend run <script>` usage.
11. `frontend/`: confirm `npm run build` and `npm run dev` succeed with no errors on the empty scaffold.

## Validation
- `npm --prefix frontend run build` completes with no TypeScript/build errors.
- `npm --prefix frontend run dev` boots the dev server and the placeholder route renders in a browser with `dir="rtl"`/`lang="he"` present on `<html>`.
- `npm --prefix frontend run lint` passes with the default Vite React-TS ESLint config.
- Manually confirm no `tailwind.config.js` file exists (v4 CSS-first config only) and that `frontend/src/main.css` contains the `@theme` block with the token names from `.rule/style-rules.md`.
- No test framework validation required — no tests are introduced by this ticket (see Assumptions).

## Risks
- Tailwind v4's CSS-first setup is newer/less familiar than v3's `tailwind.config.js` approach — misconfiguring `@tailwindcss/vite` could silently produce unstyled output; mitigate by verifying a utility class renders visibly in the dev server before marking done.
- Placeholder `@theme` tokens (no real mockups yet) risk drifting from whatever the Designer agent later produces; mitigate by keeping the token *names* aligned with `.rule/style-rules.md` now so only values need updating later, not structure.
- This ticket touches no auth/PII/seat-concurrency code — `security` is deliberately excluded from Scope-Agents; if a later revision of this plan adds any real service logic, Scope-Agents must be revisited.
- No test framework is installed here, which could be mistaken for skipping a required step; `.rule/testing-rules.md` is deferred deliberately since there is no logic yet to test — flagged so the next ticket that adds real logic doesn't skip test setup.

## Rollout Order
1. `frontend/`: scaffold + Tailwind v4 + RTL baseline (steps 1–5).
2. `frontend/`: Zustand/Lucide/cn()/router shell (steps 6–8).
3. `frontend/`: layering skeleton folders/files (step 9).
4. `frontend/`: scripts + build/dev/lint validation (steps 10–11).

## Rollback
Delete the `frontend/` directory entirely (it is newly created by this ticket, no existing code is modified) and remove any repo-root config changes made solely to support it (none expected — no root-level config files are touched by this ticket).
