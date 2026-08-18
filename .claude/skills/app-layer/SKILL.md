---
name: app-layer
description: The root orchestrator of the application. Manages global lifecycle, authentication hydration, and top-level UI components like Toasts (sonner) and Modals.
references:
  - @docs/api-contract/ (one api-contract.<service-name>.yaml per backend service)
  - @state-management-layer/SKILL.md
---

# Requirements (Core Logic)

1. **Authentication Hydration:**
   - ClinicBook has exactly one authenticated role: `admin`. `customer` is never authenticated — no login/signup, so there is no session to hydrate for that role; the entire customer-facing booking flow is public.
   - Hydration Flow:
      - On mount: read the token from storage (`localStorage` on web, `@capacitor/preferences` on Android, if targeting native) via `auth.service.ts`.
      - Splash State: while `isHydrating`, show `SplashLoader`.
      - Post-Hydration: if a valid token exists, populate the logged-in user in the store; otherwise the app proceeds unauthenticated (fine for all public-facing screens).
   - If there is no onboarding/consent/multi-step signup funnel, do not build a step-gated hydration flow — a user either has valid credentials and logs in, or doesn't.

2. **Global Component Hosting:**
   - Render the sonner `Toaster` and `Modal` components at the root.
   - Manage the visibility state of global Modals (e.g., Session Expired, Login).

3. **Routing Strategy (Auth Guard):**
   - **Public Routes (no auth required):** `/` (Service List), `/services/:id` (Time Slot Picker), `/book/:timeSlotId` (Booking Details Form), `/confirmation/:appointmentId` (Booking Confirmation), `/login` (Admin Login).
   - **Private Routes (role-gated, `admin` only):** `/admin/appointments`, `/admin/services`, `/admin/time-slots`.
   - Guard Logic:
      - Auth Check: if `!loggedinUser` and route is private ⮕ redirect to the login route.
      - Only add an onboarding/funnel check if the product actually has a multi-step account setup — don't build one speculatively.

4. **Global Layout Wrapper:**
   - Manage the main viewport container (e.g., `min-h-screen`, `bg-slate-50`).
   - Handle directionality at the HTML level: `dir="rtl"` by default (Hebrew is primary); switch to `dir="ltr"` when the user selects English. Set this on `<html>`, not per-component, and use Tailwind logical properties (`ps-*`/`pe-*`, `text-start`/`text-end`) throughout so layout flips correctly — see `css-layer` skill.

5. **Route Guard Implementation:**
   - Create a wrapper component `ProtectedRoute` for private routes.
   - Inside the guard:
      - Get the logged-in user from the store.
      - If absent, redirect to the login route.
      - No further step-gating is needed beyond this single check unless the product defines one.

6. **Version Governance & Upgrade Orchestration**
   - Not in scope for v1 — no forced-update/version-governance UI is required.
   - Do not build `UpgradeRequired`/`UpgradeRecommended` components speculatively — if this becomes a real requirement, scope it explicitly first, following a `Major/Minor/Patch` comparison approach, before adding it here.

# Tailwind Implementation Logic
- *Root Container:* `relative w-full min-h-screen overflow-x-hidden selection:bg-blue-100`.
- *Overlay Layer:* High `z-index` (e.g., `z-[9999]`) for the sonner `Toaster` container.
- *Modal Layer:* Login modal and any confirmation modals sit below the Toaster but above all page content.

# Files Structure
ClinicBook/
└── frontend/
    └── src/
    │   ├── App.tsx                 # Main Logic & Routing
    │   ├── AppProviders.tsx        # Context/Store Providers
    │   └── main.tsx                # Entry point
