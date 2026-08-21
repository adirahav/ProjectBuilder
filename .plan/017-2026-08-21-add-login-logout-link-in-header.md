# Plan 017 — Add Login/Logout link in Header

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: frontend, qa, security

## Goal
Give the shared `AppHeader` (rendered on every route, public and Admin alike) a visible auth affordance: a "Login" link when nobody is signed in, and a "Logout" action plus the signed-in Admin's identity when a session exists — using the `auth` slice (`token`, `admin`, `logout`) already built in Plan 011, with no backend changes.

## Scope
- In scope (`frontend/src/components/layout/AppHeader.tsx`): read `token`/`admin`/`logout` from `useStore`; render a `Link` to `/admin/login` when `token` is null; render the admin's display identity plus a "Logout" button when `token` is present; wire the Logout button to call the store's `logout()` action and navigate to `/` (public home) afterward.
- In scope (`frontend/src/i18n/` locale resource files, wherever `t('brand.name')` and sibling header strings live): add translation keys for "Login"/"Logout" (and "Signed in as ..." if used) in both Hebrew and English, consistent with existing i18n coverage (Plan 014).
- In scope: minor styling of the new link/button to match the existing header row (`LanguageToggle` placement, focus-visible ring, RTL/LTR logical properties per `css-layer`), and an accessible label distinguishing the Logout action from decorative icons (`accessibility-layer`).
- Out of scope: any change to `auth.slice.ts`, `authService`, `ProtectedRoute`, or the `/admin/login` page itself — all already implemented in Plan 011 and reused as-is here. No backend route changes (F5 is already wired). No new "who am I" endpoint — `admin` identity is read from the already-persisted client-side cache.
- Repo-relative scope: all changes confined to `frontend/src/components/layout/AppHeader.tsx`, `frontend/src/components/layout/AppHeader.test.tsx` (or equivalent new/updated test), and the frontend i18n resource file(s) under `frontend/src/i18n/`.

## Assumptions
- The `auth` Zustand slice (`token`, `admin`, `logout`, `hydrateAuth`) from Plan 011 is stable and already hydrated at app boot in `App.tsx` (`hydrateAuth()` runs in a `useEffect`), so `AppHeader` can safely read `token`/`admin` without triggering its own fetch.
- `AdminIdentity` (from `frontend/src/types/auth.types.ts`) carries at least an email/username suitable for a "Signed in as X" label; if it does not, the header falls back to a generic "Logout" with no name (see Open Questions).
- Showing the Login link on every public page (not just Admin-adjacent ones) is acceptable UX for a small single-groomer clinic site — there is no requirement to hide Admin affordances from Customers.
- Logout is client-side only (matches Plan 011's "no server-side revocation" decision) — clicking Logout simply clears the store/persisted token and redirects home.

## Open Questions
1. Where should the Logout action redirect after clearing the session — the public home (`/`) or the Admin login page (`/admin/login`)?
   - Recommended: redirect to `/` (public home). The header is shared across all routes, so an Admin logging out from `/admin/services` landing back on `/` is the least surprising default; the login link stays reachable from the header on the next visit regardless.
2. Should the header show the Admin's identity (e.g. email) next to Logout, or just a bare "Logout" button?
   - Recommended: show it if `AdminIdentity` has a usable display field (e.g. `email`), truncated/responsive on small screens; otherwise ship a bare "Logout" button rather than adding a new field to the identity payload, since that would expand scope beyond a header link.
3. Should the Login/Logout affordance be hidden on purely public Customer screens (Service List, Slot Picker, etc.) to avoid confusing Customers who never need an account?
   - Recommended: keep it visible everywhere for consistency and simplicity (matches how `LanguageToggle` is already global); a Customer seeing a small "Login" link is low-risk and avoids route-based conditional logic in the shared header.

## Steps
1. `frontend/src/components/layout/AppHeader.tsx` — import `useStore`, `useNavigate` (or `Link`/`useNavigate` from `react-router-dom`); select `token`, `admin`, `logout`.
2. `frontend/src/components/layout/AppHeader.tsx` — add a right-side auth section (alongside `LanguageToggle`): if `token` is null, render `<Link to="/admin/login">{t('header.login')}</Link>`; if `token` is present, render the optional identity label plus a `<button>` calling an `onClick` handler that awaits `logout()` then navigates to `/` (per Open Question 1).
3. `frontend/src/components/layout/AppHeader.tsx` — style the new elements to match the existing header (focus-visible ring, spacing, RTL-safe logical properties, icon from `lucide-react` if desired for visual parity with the brand mark).
4. `frontend/src/i18n/<locale files>` — add `header.login`, `header.logout` (and `header.signedInAs` if Open Question 2 resolves to showing identity) keys in both Hebrew and English resource files.
5. `frontend/src/components/layout/AppHeader.test.tsx` (new or extended) — unit tests: renders "Login" link to `/admin/login` when `token` is null; renders "Logout" button when `token` is present; clicking Logout calls the store's `logout` and navigates to `/`.

## Validation
- With no session (`token` null), the header shows a "Login" link that navigates to `/admin/login` on both public and any directly-visited Admin URL (before the `ProtectedRoute` redirect resolves).
- After a successful Admin login (Plan 011 flow), the header on `/admin`/`/admin/services`/`/admin/appointments` shows "Logout" (and identity, if implemented) instead of "Login".
- Clicking Logout clears the persisted token (localStorage) and in-memory store, redirects to `/`, and the header immediately reflects the signed-out state without a page reload.
- Keyboard-only navigation can reach and activate both the Login link and Logout button; both have accessible, non-icon-only labels (`accessibility-layer`).
- Header renders correctly in both Hebrew (RTL) and English (LTR) with no hardcoded left/right spacing regressions (`css-layer`).
- No changes to any backend service; existing Plan 011 auth flow tests continue to pass unmodified.

## Risks
- **Client-only Logout with no server-side token revocation**: a copied/leaked JWT remains valid until its expiry even after the user clicks Logout, since Plan 011 deliberately has no server-side blacklist. Not a new risk introduced by this task (inherited from Plan 011), but `security` is included in Scope-Agents to confirm this remains an acceptable v1 tradeoff now that Logout is a first-class, easily-discoverable UI action rather than a `store.logout()` call with no entry point.
- **Header is rendered on every route, including all public Customer screens**: a bug in the auth-state read (e.g. reading `token` before `hydrateAuth()` resolves) could briefly flash "Login" for an already-signed-in Admin or vice versa. Mitigated by relying on `App.tsx`'s existing `isHydratingAuth` gate pattern (already used by `ProtectedRoute`) if a flash is observed during manual testing.
- **No new backend surface**: this task only reads existing `auth` slice state and calls the existing `logout()` action, so `api-gateway`, `user-service`, `booking-service`, and `notification-service` are correctly excluded from Scope-Agents.

## Rollout Order
1. `frontend/src/i18n/` — add the new translation keys first, so the component step can reference them immediately (Step 4 before Step 2 in practice, though listed after in Steps for readability).
2. `frontend/src/components/layout/AppHeader.tsx` — implement the conditional Login/Logout UI and wiring (Steps 1–3).
3. `frontend/src/components/layout/AppHeader.test.tsx` — add/extend tests (Step 5).
4. Manual verification across signed-out, signed-in, Hebrew, and English states (Validation).

## Rollback
- Revert `frontend/src/components/layout/AppHeader.tsx` to its pre-change version (brand mark + `LanguageToggle` only).
- Remove the added `header.login`/`header.logout`/`header.signedInAs` keys from the i18n resource files.
- Remove or revert `frontend/src/components/layout/AppHeader.test.tsx` changes.
- No backend or store-slice files are touched, so no backend/store rollback is needed.
