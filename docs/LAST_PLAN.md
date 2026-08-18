# Plan 007 — Service List page (public Customer screen)

- Status: draft
- Owner: orchestrator
- Last updated: 2026-08-18
- Scope-Agents: frontend, booking-service, qa, security

## Goal
Build Screen 1 (Service List) from the PRD: a public, unauthenticated page that lists all active `Service` records (name, duration, price), gives each a "Book" action that starts the booking flow, and supports Hebrew/English toggle with RTL-by-default layout. This is the customer's landing page and first touch of the booking flow.

## Scope
- In scope (`frontend/`): a `ServiceList` page/route, a service-fetching layer (API client call to `GET /api/services`), a `ServiceCard`/list item component (name, duration, price, "Book" button), loading/empty/error states, Hebrew (default, RTL)/English (LTR) language toggle wired to this page's text and layout direction, mobile-first responsive styling with Tailwind logical properties per `css-layer`, accessible markup per `accessibility-layer`.
- In scope (`booking-service/`): the `GET /api/services` route (F1) returning only `Service` records where `isActive: true` — this is the minimum backend surface this page needs and does not yet exist per plan 004 (scaffold-only). Includes a minimal `Service` Mongoose model (name, duration, price, isActive) if not already present, scoped strictly to what F1 requires.
- Out of scope: the Time Slot Picker / booking flow itself (Screen 2 onward — the "Book" action only needs to navigate/route there, not implement it), Admin service management (Screens 6, F6–F8), any service creation/edit/deactivate logic, `api-gateway` routing/proxying for this public route (public routes per PRD are unauthenticated and may be called directly against `booking-service` or proxied — left for the gateway task), full i18n framework selection beyond what's needed for this one page's strings, Capacitor/native-specific navigation handling (`native-navigation-layer` — no back-stack concerns on a landing page).
- Repo-relative scope: frontend changes under `frontend/src/` (new page/component/api files); backend changes under `booking-service/src/` (new model + route files). No changes to `api-gateway/`, `user-service/`, or `notification-service/`.

## Assumptions
- `frontend/` is currently a bare Vite+React+TS+Tailwind scaffold (plan 001) with only `react`/`react-dom` installed (plan 002 added zustand/axios/lucide-react etc. to the install list, but no app code exists yet — no router, no i18n library, no API client, no Zustand store).
- This task is the first real feature page, so it must also stand up the minimal supporting scaffolding it needs: a router (for the "Book" navigation target and future screens), an axios-based API client module, and a minimal i18n/RTL mechanism (a lightweight language-toggle + string dictionary is sufficient for this one page; a full i18n library is not required yet).
- `booking-service` (plan 004) currently exposes only `GET /health` — no models or business routes exist yet, consistent with plan 004's "out of scope" note. This task adds the smallest possible `Service` model + F1 route needed to unblock the page; it does not add F6–F11 (admin service CRUD).
- Price and duration formatting (currency symbol, minutes vs. hours) follows locale (Hebrew/English) but a single currency (e.g. ILS) is assumed for v1 since the PRD gives no multi-currency requirement.
- No auth on this route, consistent with "all public booking routes are unauthenticated by design."

## Open Questions
1. Should this task introduce the app-wide router and language-toggle mechanism (since none exists yet), or should that be split into a separate "app shell" task first?
   - Recommended: introduce the minimum needed here (a router with one real route + a placeholder route for the booking flow, and a simple language-context/localStorage toggle) — blocking this page on a separate app-shell task adds coordination overhead for infrastructure this page needs anyway, and both are small.
2. Should `booking-service`'s `GET /api/services` route and `Service` model be built in this task, or deferred to a dedicated backend task since plan 004 explicitly scoped models out?
   - Recommended: build the minimal `Service` model + `GET /api/services` (F1 only, read-only, active-only) here — the frontend page has nothing real to render without it, and this is the narrowest possible backend slice; F6–F8 (admin create/edit/deactivate) remain a separate task.
3. What should the "Book" action do given Screen 2 doesn't exist yet — navigate to a not-yet-built route, or be disabled/stubbed?
   - Recommended: navigate to a real route path (e.g. `/book/:serviceId`) that renders a placeholder/"coming soon" element for now, so the routing contract is established and the follow-up Time Slot Picker task only has to fill in the route's content, not invent the navigation.
4. Currency/formatting: hardcode ILS with locale-aware number formatting, or leave currency unlabeled (plain number) for v1?
   - Recommended: hardcode ILS (₪) with `Intl.NumberFormat` per active locale — an unlabeled price is a worse customer experience and the PRD's clinic context (no stated multi-currency need) supports a single hardcoded currency.

## Steps
1. `frontend/package.json` — install `react-router-dom` and `axios` (per plan 002's dependency list) if not already present; confirm `zustand`/`lucide-react` availability for later use (icons on this page are optional but lucide-react may be used for a loading spinner).
2. `frontend/src/api/client.ts` — create a minimal axios instance (base URL from an env var, e.g. `VITE_BOOKING_SERVICE_URL`) for calling `booking-service` directly.
3. `frontend/src/api/services.ts` — add a `getServices()` function calling `GET /api/services` and typed to a `Service` interface (`_id`, `name`, `durationMinutes`, `price`, `isActive`).
4. `frontend/src/i18n/` — add a minimal language dictionary (en/he) and a `LanguageContext`/hook that toggles `document.dir` (`rtl`/`ltr`) and persists the choice (localStorage), per `css-layer`'s logical-properties requirement.
5. `frontend/src/router.tsx` (or equivalent) — set up `react-router-dom` with a `/` route (Service List) and a `/book/:serviceId` placeholder route.
6. `frontend/src/pages/ServiceList/ServiceList.tsx` — page component: fetches services on mount via `getServices()`, renders loading/empty/error states, renders a list of `ServiceCard`s, renders the language toggle.
7. `frontend/src/pages/ServiceList/ServiceCard.tsx` — presentational component: name, formatted duration, formatted price (`Intl.NumberFormat`), "Book" button that navigates to `/book/:serviceId`; built per `ui-component-layer` and `accessibility-layer` (semantic list markup, button has accessible name, focus-visible states, no color-only meaning needed here since there's no status indicator on this screen).
8. `frontend/src/App.tsx` / `main.tsx` — wire the router and `LanguageContext` provider at the app root, replacing the current Vite starter markup.
9. `booking-service/src/models/Service.js` — minimal Mongoose schema: `name` (String, required), `durationMinutes` (Number, required), `price` (Number, required), `isActive` (Boolean, default true), timestamps.
10. `booking-service/src/routes/services.js` — `GET /api/services` handler: `Service.find({ isActive: true })`, returns JSON array.
11. `booking-service/src/server.js` — mount the new services router under `/api/services`.
12. Manual verification: run `booking-service` locally with MongoDB reachable, seed/insert a couple of `Service` docs (one active, one inactive), run `frontend` dev server, confirm the page lists only the active service(s), toggling language flips direction and text, and "Book" navigates to the placeholder route.

## Validation
- `GET /api/services` (against a running `booking-service`) returns HTTP 200 with a JSON array containing only `isActive: true` services, each with `name`, `durationMinutes`, `price`.
- Loading the frontend Service List page against a running `booking-service` renders the active services with correctly formatted duration and price; an inactive seeded service does not appear.
- Loading state renders while the request is in flight; an empty-services response renders a clear "no services" message instead of a blank page; a network/API error renders a clear error message instead of an unhandled crash.
- Toggling the language control switches all visible strings on this page between Hebrew and English and flips `dir` between `rtl`/`ltr`; the choice persists across a page reload.
- Clicking "Book" on a service navigates to `/book/<that service's id>`.
- Keyboard-only navigation can reach and activate every "Book" button; each button has an accessible name that includes the service name (not just "Book").
- No changes leak into `api-gateway/`, `user-service/`, or `notification-service/`.

## Risks
- **New unauthenticated backend route**: `GET /api/services` is a new public, unauthenticated endpoint in `booking-service`; even though read-only, it's a new integration/attack surface (e.g. must not leak inactive services, must not allow query-param injection into the Mongoose filter) — `security` is included in Scope-Agents to review this route and the model, not because auth is added.
- **Backend scope creep**: this task deliberately builds only the read/active-only slice of `Service` (F1); if implementation drifts into adding create/edit/deactivate (F6–F8) here, that expands `booking-service`'s surface ahead of its own planned task — mitigated by the explicit Out-of-scope note and Steps list.
- **Frontend infra bootstrapping risk**: since no router/i18n/API-client exists yet, this task also makes first-time architectural choices (router library usage, language-context shape, axios client shape) that later screens (2–4) will inherit — a wrong pattern here compounds; mitigated by keeping choices minimal and conventional (react-router-dom, a simple context, axios) rather than inventing bespoke abstractions.
- **RTL/accessibility regressions**: hardcoding any left/right CSS instead of logical properties would break the Hebrew-default RTL requirement; mitigated by following `css-layer` and reviewing this page's Tailwind classes specifically for physical-direction utilities before merging.
- No `user-service` or `notification-service` code is touched by this task, so they are correctly excluded from Scope-Agents; `api-gateway` is excluded because this task calls `booking-service` directly for the public route and assigns no gateway work in Steps.

## Rollout Order
1. Backend slice first: `Service` model + `GET /api/services` route in `booking-service` (Steps 9–11), verified via direct HTTP call.
2. Frontend infra: API client, router, language context (Steps 1–5).
3. Frontend feature: `ServiceList` page + `ServiceCard`, wired to the router/i18n/app root (Steps 6–8).
4. End-to-end manual verification against both running services (Step 12 / Validation).

## Rollback
- Frontend: remove `frontend/src/pages/ServiceList/`, `frontend/src/api/`, `frontend/src/i18n/`, `frontend/src/router.tsx`, and revert `App.tsx`/`main.tsx` to the prior starter state; no other page depends on these yet.
- Backend: remove `booking-service/src/models/Service.js` and `booking-service/src/routes/services.js`, and unmount the router from `server.js`; no other route or service references `Service` yet, so removal is isolated.
