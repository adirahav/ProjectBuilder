# Plan 015 — Native (Capacitor) Android/iOS wrap-up and back-button navigation

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: frontend, qa

## Goal
Finish wiring the existing web codebase for native Android/iOS delivery via Capacitor and implement the native hardware/gesture back-button behavior specified in `native-navigation-layer`, so the single React codebase (already Capacitor-aware for storage via `@capacitor/preferences`, per plan 014) becomes a buildable, correctly-navigating native app — per the PRD's non-functional requirement: "Web and native (Capacitor/Android/iOS) targets from the same codebase; native handles back-button/navigation-stack behavior."

## Scope
- In scope (`frontend/`):
  - Add Capacitor platform scaffolding: `frontend/capacitor.config.ts`, `frontend/android/` and `frontend/ios/` native projects (`npx cap add android`/`ios`), and the `@capacitor/app` plugin (needed for the `backButton` event and `App.exitApp()`/`minimizeApp` — `@capacitor/core` and `@capacitor/preferences` are already installed per `frontend/package.json`, but no back-button plugin exists yet).
  - A single native-navigation orchestration module (e.g. `frontend/src/native/backButton.ts` + a `useNativeBackButton` hook) that, on native platforms only (`Capacitor.isNativePlatform()`), subscribes once to `App.addListener('backButton', ...)` and implements, per `native-navigation-layer`:
    - Root-screen detection for `/` and `/admin` (once authenticated) → Double-Press-to-Exit (toast + 2s threshold + `App.minimizeApp()`).
    - Standard back-navigation (`navigate(-1)`) for linear screens: `/book/:serviceId`, `/book/:serviceId/details`, `/book/:serviceId/confirmation(/:appointmentId)`, `/admin/login`, `/admin/appointments`.
    - Modal-first dismissal: the back-button event must be intercepted and consumed by any currently-open `ModalDialog`/`CancelAppointmentDialog`/`DeactivateServiceDialog`/`ServiceForm` modal instance before it reaches route-level navigation.
    - Auth-driven branching: `/admin/login` → `/` on back; authenticated `/admin` root → root behavior; logged-out/401 mid-session on an authenticated route → treat as if already redirected to `/admin/login` (route guard already handles the redirect via `ProtectedRoute`, per `frontend/src/App.tsx`) so back-button logic reads current route/auth state, not stale state.
    - Post-login history hygiene: confirm/ensure the admin-login → dashboard transition uses `navigate('/admin', { replace: true })` so `/admin/login` is wiped from history (no code currently guarantees this — must be verified/fixed).
  - Localized "Press back again to exit" toast copy added to the existing i18n dictionary (plan 014's `frontend/src/i18n/` structure), reusing the existing `sonner` `Toaster` already mounted in `frontend/src/App.tsx`.
  - `frontend/package.json` — add `@capacitor/android`, `@capacitor/ios`, `@capacitor/app` as dependencies; add `cap:sync`/`cap:open:android`/`cap:open:ios` convenience scripts.
  - Native build config review: safe-area handling (notch/status bar) via CSS logical `env(safe-area-inset-*)` insets on the app shell, consistent with `css-layer`'s logical-property approach — flag only, minimal fix if trivial.
- Out of scope: publishing to app stores, native app icons/splash screens/signing, push notifications, any new product screens or backend endpoints, changing the existing `@capacitor/preferences`-based locale/auth storage from plan 014 (reused as-is), CI pipeline changes for native builds.
- Repo-relative scope: all changes are under `frontend/` (new `frontend/capacitor.config.ts`, `frontend/android/`, `frontend/ios/`, `frontend/src/native/`, edits to `frontend/src/App.tsx`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/components/common/ModalDialog.tsx` and the admin dialog/form components, `frontend/src/i18n/`, `frontend/package.json`). No backend folders are touched.

## Assumptions
- `@capacitor/core` and `@capacitor/preferences` are already present (plan 014), confirming this project always intended native targets; this task is the first to actually add the native platform folders and back-button plugin — no prior plan created `frontend/android/`, `frontend/ios/`, or `frontend/capacitor.config.ts`.
- `frontend/src/components/common/ModalDialog.tsx` is the shared modal primitive used by `CancelAppointmentDialog`, `DeactivateServiceDialog`, and `ServiceForm` (per grep of `frontend/src/components/admin/`); centralizing back-button interception in this one shared component (e.g. registering/deregistering a "modal is open" flag or its own listener on mount/unmount) covers all current and future modals without per-modal duplication.
- `react-router-dom`'s `BrowserRouter`/history stack (already in use in `frontend/src/App.tsx`) is retained as-is; native back-button handling is layered on top via a Capacitor listener calling the router's `navigate`, not a replacement navigation system.
- This is a frontend-only task: no new API endpoints, no auth contract changes, no PII handling changes — `api-gateway`, `booking-service`, `user-service`, `notification-service` are not needed in Scope-Agents. `security` is intentionally omitted too: this task only reorders client-side navigation/history around the *existing* JWT auth flow (no new auth logic, no token handling changes) — flagged as a judgment call in Open Questions since auth-driven branching is involved.
- Testing native back-button behavior end-to-end requires an Android emulator/iOS simulator; automated coverage will target the extracted decision logic (root vs. linear vs. modal-intercept, given a route+modal-state input) as pure unit tests, with manual emulator verification for the actual native event wiring.

## Open Questions
1. Should `security` be added to Scope-Agents given this task touches auth-driven back-button branching (`/admin/login` history wipe, authenticated-root detection)?
   - Recommended: no — the JWT issuance/verification flow itself (plan 011, `user-service`, `api-gateway`) is unchanged; this task only reads existing auth state (`isAuthenticated` from the store) to decide client-side navigation. If review surfaces an actual security-relevant gap (e.g. a stale token being usable after a background/foreground cycle), escalate then rather than including `security` speculatively now.
2. Should Android and iOS platforms both be scaffolded in this task, or should iOS be deferred (e.g. if only Android is being actively tested/shipped first)?
   - Recommended: scaffold both (`npx cap add android` and `npx cap add ios`) — the PRD explicitly names both, the incremental cost of `cap add` is low, and deferring iOS risks it silently rotting (untested native-layer assumptions) until someone eventually needs it.
3. Should the Double-Press-to-Exit toast and modal-interception logic be unit-testable in isolation from the actual `@capacitor/app` plugin (which only fires in a real native runtime), or is manual emulator testing sufficient?
   - Recommended: extract the decision logic (given current route, auth state, and "is a modal open" flag, what should happen) into a pure function unit-tested in `frontend/src/native/*.test.ts`, with the actual `App.addListener('backButton', ...)` wiring kept as a thin, manually-verified integration layer — this matches how the rest of the frontend is tested (per existing `*.test.tsx` files) and avoids the back-button logic being untestable dead code in CI.
4. Does the shared `ModalDialog` component already expose an `onOpenChange`/`isOpen` API that a global "is any modal open" tracker can hook into, or does each consumer (`CancelAppointmentDialog`, `DeactivateServiceDialog`, `ServiceForm`) manage its own open state independently?
   - Recommended: default to inspecting `frontend/src/components/common/ModalDialog.tsx` first during implementation; if it's a pure presentational component with per-consumer state, add a lightweight app-level "active modal" registry (a small zustand slice alongside the existing `frontend/src/store/slices/`) that `ModalDialog` itself registers/deregisters on mount/unmount, so no per-consumer wiring is needed.

## Steps
1. `frontend/package.json` — add `@capacitor/android`, `@capacitor/ios`, `@capacitor/app` dependencies; run `npx cap init` if not already configured, producing `frontend/capacitor.config.ts` (app id, app name, `webDir: 'dist'`).
2. Run `npx cap add android` and `npx cap add ios` from `frontend/` to scaffold `frontend/android/` and `frontend/ios/` native projects; document the required `npm run build && npx cap sync` flow in `frontend/README.md`.
3. `frontend/src/native/backButtonLogic.ts` — pure function(s) encoding the decision table from `native-navigation-layer` §1–5: given `{ pathname, isAuthenticated, isModalOpen }`, return one of `{ closeModal, exit-double-press-prompt, exit-background, navigate-back, redirect-to-root }`.
4. `frontend/src/native/backButtonLogic.test.ts` — unit tests covering: root screens (`/`, `/admin`) trigger double-press flow; linear screens (`/book/:id`, `/book/:id/details`, confirmation routes, `/admin/login`, `/admin/appointments`) trigger single back-step; `/admin/login` back → `/`; open-modal state always wins regardless of route.
5. `frontend/src/store/slices/` (new slice or extend an existing UI slice) — add a minimal "active modal" tracker if `ModalDialog.tsx` doesn't already expose one (resolves Open Question 4); wire `frontend/src/components/common/ModalDialog.tsx` to register/deregister on mount/unmount.
6. `frontend/src/native/useNativeBackButton.ts` — hook that, only when `Capacitor.isNativePlatform()` is true, subscribes to `App.addListener('backButton', ...)` on mount (once, at the app root) and dispatches to `backButtonLogic`, calling `navigate(-1)`, `App.minimizeApp()`, or closing the active modal accordingly; shows the "Press back again to exit" toast via the existing `sonner` `Toaster` on the first double-press-window press.
7. `frontend/src/App.tsx` — mount `useNativeBackButton()` once in `AppRoutes` (has access to `navigate`, `locale`, `isAuthenticated`); verify/fix the admin-login → `/admin` transition to use `navigate('/admin', { replace: true })` so `/admin/login` is not left in history (Scope item).
8. `frontend/src/i18n/` — add the "Press back again to exit" string in Hebrew ("לחץ שוב על חזרה כדי לצאת") and English to the existing dictionary structure from plan 014.
9. Safe-area review: audit `frontend/src/App.tsx`'s root shell and `AppHeader` for `env(safe-area-inset-*)` handling; add minimal CSS (logical, per `css-layer`) if status-bar/notch overlap is visually apparent when running in the emulator.
10. Manual emulator verification (Android Studio emulator at minimum; iOS Simulator if available): double-press exit on `/` and on authenticated `/admin`; single back-step through the booking flow and through `/admin/appointments`; modal-open back-press closes the confirm/cancel and service-form dialogs without navigating; login → back does not return to `/admin/login`.

## Validation
- `frontend/src/native/backButtonLogic.test.ts` passes and covers every branch in the `native-navigation-layer` checklist (root/double-press, linear/single-step, modal-intercept, login-history-wipe).
- `npx cap sync` completes without error after `npm run build`, and the generated `frontend/android/` project builds/launches in an emulator showing the existing web UI unchanged.
- On a native emulator: pressing back on `/` or authenticated `/admin` shows the toast on first press and backgrounds the app on a second press within 2 seconds; a press after the 2-second window resets to showing the toast again (not an immediate exit).
- On a native emulator: back-button on any modal (`CancelAppointmentDialog`, `DeactivateServiceDialog`, `ServiceForm`) closes only the modal, leaving the underlying page/data untouched.
- On a native emulator: back-button from `/admin/login` goes to `/`; back-button after a successful admin login never returns to `/admin/login`.
- No change to web-only behavior: running `frontend` in a regular browser (`npm run dev`) shows no native-only UI (toast/exit logic) since `Capacitor.isNativePlatform()` gates the entire listener registration.
- Existing frontend test suite (`npm run test` per `frontend/package.json`) continues to pass unchanged for all non-native-specific tests.

## Risks
- **Modal-detection gaps**: if `ModalDialog.tsx` doesn't already centralize open/close state, missing even one consumer (`CancelAppointmentDialog`, `DeactivateServiceDialog`, `ServiceForm`) from the active-modal registry means back-button would incorrectly fall through to page navigation while that modal is open — mitigated by Step 5's audit and by testing all three dialog types explicitly in Step 10.
- **Double-press timing/UX regressions**: an incorrectly implemented 2-second window (e.g. not resetting after timeout, or firing `minimizeApp` on the first press) directly contradicts the "Do Nothing Prohibition" and "no accidental exit" goals in `native-navigation-layer` — mitigated by unit-testing the pure decision logic (Step 4) separately from the native event wiring.
- **Native-only code leaking into the web build**: forgetting the `Capacitor.isNativePlatform()` guard would register a real `backButton` listener that never fires on web but could still create dead subscriptions or console warnings — mitigated by the explicit guard called out in Steps 3 and 6 and checked in Validation.
- **Emulator-dependent verification**: this task's most important behavior (native back-button interception) cannot be fully verified by the existing Vitest/jsdom test suite and requires manual Android Studio/Xcode emulator runs — mitigated by extracting testable pure logic (Steps 3–4) so CI still catches decision-table regressions even without a native runtime.
- **No backend or auth-contract surface touched**: this task only reorders client-side navigation around existing auth state; no JWT issuance/verification logic changes, so `user-service`, `api-gateway`, `booking-service`, `notification-service`, and `security` are correctly excluded from Scope-Agents (see Open Question 1 for the judgment call on `security`).

## Rollout Order
1. Platform scaffolding first: `capacitor.config.ts`, `@capacitor/app` dependency, `android`/`ios` folders (Steps 1–2) — nothing else depends on this but it must exist before the app can be run natively at all.
2. Pure decision logic + unit tests (Steps 3–4) — establishes and verifies the behavioral contract before any UI wiring.
3. Modal-state tracking (Step 5) — a prerequisite for the hook in Step 6 to know when to intercept.
4. Hook + app-root wiring + login-history fix + i18n string (Steps 6–8).
5. Safe-area polish (Step 9) as a lower-priority visual pass.
6. Full manual emulator verification last (Step 10), once all logic and wiring is in place.

## Rollback
- Revert `frontend/src/native/` (new files), the modal-registry slice addition, and the `useNativeBackButton()` call in `frontend/src/App.tsx` via version control — the web app continues to function exactly as before (no native-only code executes on web regardless).
- `frontend/android/` and `frontend/ios/` can be deleted and re-scaffolded with `npx cap add android`/`ios` at any time since they are generated artifacts, not hand-authored source; no data loss risk.
- Revert `frontend/package.json` dependency additions (`@capacitor/android`, `@capacitor/ios`, `@capacitor/app`) and the i18n dictionary addition.
- Since no backend files or shared data contracts are touched, rollback is isolated entirely to `frontend/` and carries no cross-service coordination risk.
