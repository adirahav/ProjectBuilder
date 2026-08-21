# Security Agent Report — ADDLOGIN-SEC (Add Login/Logout link in Header)

Ticket: ADDLOGIN-SEC
Plan: `.plan/017-2026-08-21-add-login-logout-link-in-header.md`

## Scope of this audit

Plan 017 is explicitly frontend-only: `AppHeader.tsx` reads `token` / `admin` /
`logout` from the existing Plan 011 `auth` Zustand slice and renders a Login
link or a Logout button. No route, controller, model, or API contract in
`api-gateway`, `user-service`, `booking-service`, or `notification-service` was
touched by this task (confirmed against the frontend, api-gateway, user-service,
booking-service, and notification-service agent reports for this ticket, all of
which report no backend changes). Accordingly this audit is scoped to:

1. The new client-side rendering surface in `frontend/src/components/layout/AppHeader.tsx`.
2. Re-confirming the pre-existing `auth` slice (`frontend/src/store/slices/auth.slice.ts`) and `auth.service.ts` contracts that the header now exercises via a first-class, easily discoverable UI entry point (previously `logout()` had no UI trigger at all).
3. The four API contract YAML files, to confirm none define new surface relevant to this ticket (they don't — no diff).

No backend service code was reviewed for new vulnerabilities because none was
added; `.rule` and PRD constraints (single Admin account, gateway-only login,
no server-side revocation) were already accepted in Plan 011's own security
review.

## Findings

### 1. Admin identity (`admin.email`) is safe to render — no stored/reflected XSS
`AppHeader.tsx` interpolates `admin.email` directly into JSX
(`{t('header.signedInAs', { email: admin.email })}`). Since `admin` is
attacker-reachable in principle (it's a Zustand-persisted value ultimately
sourced from local storage), a crafted email value was tested end-to-end
(`<img src=x onerror=alert(1)>@studio.test`). React's default JSX text-node
escaping applies — the string renders as inert text, no element is injected
into the DOM, and no handler fires. **No action required**; this is a
regression guard for the future, not a live vulnerability.

### 2. The raw JWT is never written into the DOM
`token` is read only for its truthiness (`token ? … : …`); it is never
interpolated into text, attributes, `href`, or `data-*`. Verified directly:
rendering with a signed-in session and asserting the token string does not
appear anywhere in `container.innerHTML`. **No action required.**

### 3. The Login link is a static, fixed target — no open-redirect surface
`<Link to={ADMIN_LOGIN_ROUTE}>` resolves to a hardcoded `/admin/login` with no
query string, hash, or dynamic `returnTo`-style parameter. There is therefore
no vector for an attacker-supplied redirect target via this link. **No action
required.**

### 4. Logout is resilient to a rejecting `logout()`, matching the slice's real contract
`AppHeader.handleLogout` has no `try/catch` of its own and relies on
`auth.slice.ts`'s `logout()` never rejecting (it wraps its own storage clear in
try/catch and always resolves). Verified this contract holds and that, given
it holds, a click always clears both `token` and `admin` in the store and
navigates home — i.e. a shared/public browser cannot be left in a signed-in
state by a transient storage failure. This is inherited behavior, not new
code, but this ticket is the first to expose it as a one-click UI action, so
it was worth re-confirming under test rather than by inspection alone.

### 5. No session data reaches `console.log`/`console.error` from the header
Confirmed the JWT and the cached email never appear in any console call
triggered by mounting the header or clicking Logout. Relevant on the native
Capacitor build, where device/WebView logs can be more broadly readable than a
browser console.

### 6. Pre-hydration state never flashes a wrong auth affordance
Re-confirmed (functional test, restated here for security framing): while
`isHydratingAuth` is true, neither Login nor Logout renders. Without this
gate, a signed-in Admin's first paint after a refresh would show "Log in,"
which is a trust/UX regression, not just cosmetics, since it could condition
an Admin to distrust a legitimate session state or re-enter credentials
unnecessarily.

## Accepted risk (inherited from Plan 011, not introduced by this ticket)

**Client-only logout, no server-side token revocation.** Clicking Logout
clears the client's copy of the JWT (memory + local storage) but does not
invalidate the token server-side — a copied/leaked token remains valid until
its natural expiry. This was already the accepted v1 tradeoff in Plan 011
(single Admin account, small clinic site, no session-store infra). This
ticket changes the *exposure* of that tradeoff — Logout is now a visible,
discoverable header control on every route rather than an unreached
`store.logout()` call — but does not change the underlying risk. Confirmed
this remains acceptable for v1: recommend revisiting only if/when the product
adds a second Admin account, multi-device session management, or a
requirement to force-expire a specific session (e.g. after a suspected
credential leak), at which point a server-side revocation list or short-lived
token + refresh design would be warranted.

## API contract review

Reviewed all four contracts for any surface this ticket might have implicitly
touched:
- `docs/api-contract/api-contract.api-gateway.yaml`
- `docs/api-contract/api-contract.user-service.yaml`
- `docs/api-contract/api-contract.booking-service.yaml`
- `docs/api-contract/api-contract.notification-service.yaml`

No diffs are attributable to this ticket, and none were expected — the header
only calls the already-contracted `login`/logout-adjacent client storage
functions from Plan 011. No new findings.

## Tests written

`docs/tests/security/add-login-logout-header.security.test.tsx` — 5 tests, all
passing:
1. Renders a crafted `admin.email` as inert text, never as injected markup (stored XSS guard).
2. Never renders the raw JWT into the DOM.
3. Clears both the in-memory token and cached identity on Logout, even when persistence fails internally, matching the real `auth.slice.ts` contract.
4. The Login link always targets the fixed `/admin/login` route, never an attacker-influenced URL (open-redirect guard).
5. Does not leak the Login/Logout affordance before auth hydration resolves (no auth-state flash).

Run (from `frontend`, so `node_modules` resolves):
```
cd frontend && npx vitest run ../docs/tests/security/add-login-logout-header.security.test.tsx
```
Note: the project's `frontend/vitest.config.ts` restricts `test.include` to
`src/**`, so files under `docs/tests/security/` won't be picked up by a bare
`vitest run` from `frontend/` without also passing an `--config` override (or
equivalent) that widens `include` to reach `../docs/tests/security/**`; this
audit verified the suite by temporarily pointing a local, uncommitted config
at that broader include (with `resolve.alias` entries for `react`,
`react-dom`, `react-router-dom`, `@testing-library/react`,
`@testing-library/user-event`, and `sonner` pinned to `frontend/node_modules`,
plus `server.fs.allow` widened to the repo root) — no repo files were
permanently changed to make this pass.

Also re-ran the existing functional suite
(`frontend/src/components/layout/AppHeader.test.tsx`, 5 tests) to confirm
nothing in this audit's review implies a needed change there — all pass
unmodified.

## Verdict

No new vulnerabilities introduced by this ticket. The one accepted risk
(client-only logout / no server-side revocation) is a pre-existing, explicitly
scoped-in-for-confirmation tradeoff from Plan 011 and remains acceptable for
v1 given the single-Admin-account threat model. No backend, store-slice, or
API-contract changes are required.

STATUS: DONE
