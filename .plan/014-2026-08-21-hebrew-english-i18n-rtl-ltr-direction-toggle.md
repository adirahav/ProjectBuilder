# Plan 014 — Hebrew/English i18n + RTL/LTR direction toggle

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: frontend, qa

## Goal
Replace the ad-hoc, single-page language mechanism introduced in plan 007 (`frontend/src/i18n/`, used only by the Service List page) with a proper app-wide i18n + RTL/LTR system that covers every existing screen (Service List, Time Slot Picker, Customer Details Form, Booking Confirmation, Admin Login, Admin Dashboard: Services, Admin Dashboard: Appointments), per the PRD's non-functional requirement: "Hebrew (default, RTL) and English (LTR) supported throughout; UI uses logical CSS properties, not hardcoded left/right."

## Scope
- In scope (`frontend/`):
  - A single, app-wide i18n solution: a translation dictionary structure (namespaced by page/feature) covering every string currently hardcoded across `frontend/src/pages/**` (Service List, Time Slot Picker, Customer Details Form, Booking Confirmation, Admin Login, Admin Services, Admin Appointments) and any shared layout/nav components.
  - A single `LanguageContext`/store (evaluate reusing the existing plan-007 context vs. replacing it with a small typed hook) that: tracks current locale (`he` default / `en`), persists the choice (localStorage), and sets `document documentElement.dir` (`rtl`/`ltr`) and `lang` attribute globally at the app root — not per-page.
  - A visible language-toggle control promoted from the Service List page into the shared app shell/header so it is available on every screen, including Admin screens.
  - An audit and fix of every page's Tailwind classes to replace any physical-direction utilities (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, etc.) with logical-property equivalents (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `rounded-s-`, `rounded-e-`), per `css-layer`.
  - Locale-aware formatting review (dates, times, numbers/currency) on every page that displays them (Time Slot Picker's date/slot times, Customer Details Form's hold countdown, Booking Confirmation's date/time/price, Admin Appointments' calendar/list dates) so they follow the active locale, not just the Service List's existing `Intl.NumberFormat` usage.
  - Directional icons/affordances review (e.g. any chevron/arrow icons implying "next/back" or expand direction) so they flip correctly under RTL instead of staying visually backwards.
- Out of scope: adding new product features or screens; changing any backend route or model in `api-gateway`, `booking-service`, `user-service`, `notification-service`; native/Capacitor-specific direction handling beyond what CSS logical properties already provide (`native-navigation-layer` is a separate concern about back-button/stack behavior, not text direction); introducing a third language.
- Repo-relative scope: all changes are under `frontend/src/` (new/updated i18n dictionary files, context/hook, shared header/toggle component, and edits to existing page components under `frontend/src/pages/**`). No backend folders are touched.

## Assumptions
- Plans 007–013 each independently hardcoded some UI strings in component JSX (only plan 007's Service List got the actual i18n dictionary/context wiring; later pages were built without confirmation that they consumed it) — this task must audit all of them, not just extend the dictionary.
- The existing plan-007 `LanguageContext` (localStorage-persisted, toggles `document.dir`) is structurally reusable and does not need to be replaced wholesale, only: (a) lifted to wrap the whole app if it doesn't already, (b) extended with a larger dictionary, (c) exposed via a shared toggle control in a common header/layout rather than embedded in the Service List page alone.
- No dedicated i18n library (e.g. `react-i18next`) is required for v1 given the small, fixed string set across 7 screens; a typed dictionary + context/hook (as plan 007 started) is sufficient and keeps the dependency footprint per plan 002 unchanged. This can be revisited if string volume grows significantly.
- A single currency (ILS) and the existing `Intl.NumberFormat`/`Intl.DateTimeFormat` approach from plan 007 is extended to all date/time/price displays rather than introducing a new formatting library.
- This is a frontend-only refactor: no new API endpoints, no auth changes, no PII handling changes, so `api-gateway`, `booking-service`, `user-service`, `notification-service`, and `security` are not needed in Scope-Agents.

## Open Questions
1. Should the language toggle live in a new shared app header/shell component, or be duplicated per-page as plan 007 did for Service List?
   - Recommended: introduce one shared header/layout component (or extend an existing app shell if one already exists from later plans) that renders the toggle once and wraps all routes — duplicating it per page would re-introduce the same inconsistency this task exists to fix.
2. Should this task adopt a dedicated i18n library (`react-i18next`) now, or keep extending the lightweight dictionary/context from plan 007?
   - Recommended: keep the lightweight dictionary/context approach — 7 screens with a fixed, moderate string count don't justify a new dependency and migration cost; revisit only if a future plan adds substantially more content or pluralization/interpolation complexity.
3. Should Admin-side screens (Login, Services, Appointments) also default to Hebrew/RTL, or should Admin default to English/LTR since it's an internal tool?
   - Recommended: apply the same global default (Hebrew/RTL) and the same toggle to Admin screens — the PRD states the requirement applies "throughout" with no Admin carve-out, and a single global locale state (vs. two different defaults) is simpler to implement and reason about.
4. How should already-merged pages (007–013) be updated — one combined sweep in this task, or should this task only build the shared mechanism and leave per-page string migration to be verified opportunistically later?
   - Recommended: do the full sweep now in this task (dictionary entries + logical-property audit for every existing page) — leaving stale hardcoded strings/physical-direction classes in already-shipped pages means the "throughout" requirement stays unmet indefinitely with no follow-up trigger.

## Steps
1. `frontend/src/i18n/dictionary.ts` (or split per-namespace files, e.g. `dictionary.serviceList.ts`, `dictionary.booking.ts`, `dictionary.admin.ts`) — expand the existing plan-007 dictionary to cover every string used across Service List, Time Slot Picker, Customer Details Form, Booking Confirmation, Admin Login, Admin Services, Admin Appointments; both `he` and `en` entries for each key.
2. `frontend/src/i18n/LanguageContext.tsx` (or equivalent existing file) — confirm/adjust so it: defaults to `he`, sets `document.documentElement.dir` and `lang` on change, persists to localStorage, and exposes a typed `t(key)` translate function plus `locale`/`dir`/`toggleLanguage`.
3. `frontend/src/App.tsx` / root layout — ensure `LanguageProvider` wraps the entire router tree (all routes, public and Admin), not just the Service List subtree.
4. `frontend/src/components/AppHeader.tsx` (new, or reuse existing shared layout component if one was added in plans 011–013) — render the language-toggle control here once, used by every route via a shared layout wrapper.
5. `frontend/src/pages/ServiceList/*` — replace any remaining ad-hoc/local toggle logic with the shared header; confirm dictionary keys migrated cleanly.
6. `frontend/src/pages/TimeSlotPicker/*` (plan 008) — replace hardcoded strings with dictionary keys; audit date/slot-time formatting for locale-awareness; audit Tailwind classes for physical-direction utilities (e.g. slot grid layout, "no longer available" message alignment) and convert to logical properties.
7. `frontend/src/pages/CustomerDetailsForm/*` (plan 009) — replace hardcoded strings (field labels, validation messages, hold countdown text) with dictionary keys; audit form layout classes for logical properties (label/input alignment, required-field markers).
8. `frontend/src/pages/BookingConfirmation/*` (plan 010) — replace hardcoded strings with dictionary keys; audit date/time/price formatting and layout classes.
9. `frontend/src/pages/AdminLogin/*` (plan 011) — replace hardcoded strings with dictionary keys; ensure the shared header/toggle is available pre-login too (or confirm intentional exclusion if Admin login is meant to be a bare screen — flag in Validation either way); audit form layout classes.
10. `frontend/src/pages/AdminServices/*` (plan 012) — replace hardcoded strings (list headers, create/edit form labels, active/inactive toggle labels) with dictionary keys; audit table/list layout classes for logical properties.
11. `frontend/src/pages/AdminAppointments/*` (plan 013) — replace hardcoded strings (status labels, filter labels, confirm/cancel action labels) with dictionary keys; audit calendar/list layout classes, including any directional icons (e.g. date navigation chevrons) so they flip under RTL.
12. Repo-wide audit pass: grep `frontend/src/**` for common physical-direction Tailwind class prefixes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l`, `rounded-r`, `border-l`, `border-r`) outside of intentionally-physical cases (e.g. a genuinely fixed-position element that isn't direction-sensitive) and convert remaining matches to logical equivalents.
13. Manual verification: toggle language on every one of the 7 screens (Service List, Time Slot Picker, Customer Details Form, Booking Confirmation, Admin Login, Admin Services, Admin Appointments) and confirm text, direction, icon orientation, and date/number formatting all switch correctly and the choice persists across reload and across navigation between screens.

## Validation
- Every one of the 7 existing screens renders fully in both Hebrew (RTL) and English (LTR) with no leftover hardcoded strings in the non-active language.
- Toggling language on any one screen and then navigating to another screen preserves the chosen language (single global state, not per-page).
- `document.documentElement.dir` and `lang` update correctly on toggle and on initial load (respecting the persisted choice from localStorage).
- No Tailwind class in `frontend/src/pages/**` or shared components uses a hardcoded physical-direction utility where a logical-property utility is applicable (spot-checked via the grep audit in Step 12).
- Dates, times, and prices on Time Slot Picker, Customer Details Form, Booking Confirmation, and Admin Appointments render using locale-aware formatting consistent with the active language.
- Directional icons (if any exist on Admin Appointments or elsewhere) visually flip orientation under RTL vs LTR.
- Keyboard/screen-reader users can reach and operate the language toggle from every screen; the toggle has an accessible name/label (not just a flag icon or bare "EN/HE" text with no label), per `accessibility-layer`.
- Existing functional behavior (booking flow, admin CRUD, confirm/cancel actions) is unchanged by this task — only strings/formatting/layout direction are affected.

## Risks
- **Regression risk across 7 already-shipped pages**: this task touches every existing page's JSX and CSS classes to swap in dictionary keys and logical properties; a mistranslation or a missed class conversion could visually break a page that previously worked — mitigated by the explicit per-page steps (6–11) and the full manual pass (Step 13) covering every screen in both languages.
- **RTL layout breakage on complex components**: the Time Slot Picker's grid and the Admin Appointments calendar/list are the most layout-complex screens and the most likely to have physical-direction assumptions baked in (e.g. grid flow order, chevron direction) — mitigated by calling these out specifically in Steps 6 and 11 rather than relying on the generic grep audit alone.
- **Scope creep into new features**: because this task touches every page, there is a risk of "while I'm in there" changes beyond i18n/RTL (e.g. altering booking or admin logic) — mitigated by the explicit Out-of-scope note restricting changes to strings, formatting, and direction-related CSS only.
- **No backend or auth surface is touched**: this is purely a frontend presentation-layer change with no new endpoints, no changed request/response shapes, and no PII handling changes, so `booking-service`, `user-service`, `api-gateway`, `notification-service`, and `security` are correctly excluded from Scope-Agents.

## Rollout Order
1. Shared infrastructure first: dictionary expansion, `LanguageContext` adjustments, app-root provider wrapping, shared header/toggle component (Steps 1–4).
2. Public booking flow pages in PRD screen order: Service List, Time Slot Picker, Customer Details Form, Booking Confirmation (Steps 5–8).
3. Admin pages: Login, Services, Appointments (Steps 9–11).
4. Repo-wide logical-property grep audit as a final sweep to catch anything missed page-by-page (Step 12).
5. Full manual cross-page verification in both languages (Step 13 / Validation).

## Rollback
- Revert `frontend/src/i18n/dictionary.ts` (and any split namespace files), `frontend/src/i18n/LanguageContext.tsx`, and the new shared header/toggle component to their plan-007 state.
- Revert per-page edits in `frontend/src/pages/{ServiceList,TimeSlotPicker,CustomerDetailsForm,BookingConfirmation,AdminLogin,AdminServices,AdminAppointments}/` via version control to their pre-task versions.
- Since no backend files or shared data contracts are touched, rollback is isolated entirely to `frontend/src/` and carries no cross-service coordination risk.
