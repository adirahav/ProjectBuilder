---
name: app-layer
description: The root orchestrator of the application. Manages global lifecycle, authentication hydration, and top-level UI components like Toasts (sonner) and Modals.
references:
  - @docs/api-contract/ (one api-contract.<service-name>.yaml per backend service)
  - @state-management-layer/SKILL.md
---

# Requirements (Core Logic)

1. **Authentication Hydration:**
   - Hila Tours has one authenticated entity, `admin`, with two role values: `admin` and `user` (both are authenticated sessions — `user` is simply the default, unpromoted role; see `.doc/glossary.md`'s `admin`-entity vs. `admin`-role naming-collision note). `passenger` is never authenticated — no login/signup, no session to hydrate for that actor; passenger identity (name/phone/pickupPoint) is submitted per-request and lives only on the `seat` record.
   - Hydration Flow:
      - On mount: read the token from storage (`localStorage` on web, `@capacitor/preferences` on the native Android build) via `auth.service.ts`.
      - Splash State: while `isHydrating`, show `SplashLoader`.
      - Post-Hydration: if a valid token exists, populate the logged-in admin in the store; otherwise the app proceeds unauthenticated — fine, since the Passenger View is fully public.
   - There is no onboarding/consent/multi-step signup funnel — an admin either has valid credentials and logs in, or doesn't; signup is a single standalone form (see Screen 2 in `docs/PRD.md`).

2. **Global Component Hosting:**
   - Render the sonner `Toaster` and `Modal` components at the root.
   - Manage the visibility state of global Modals (e.g., Session Expired, Admin Login modal, Seat Request modal).

3. **Routing Strategy (Auth Guard):**
   - **Public Routes (no auth required):** `/` (Gateway/Login choice screen), `/signup` (Admin Signup), `/tours` and `/tours/:tourId/buses/:busId` (Passenger View — tour/bus selector + seat map).
   - **Private Routes (role-gated, require a valid JWT with `roles` including `admin`):** `/admin` (Admin Dashboard — Seat Management tab, Tours & Buses tab, Passenger Manifest Report tab). A JWT that only carries `roles: ["user"]` is rejected on every admin-mutating action per F2b/NFR in `docs/PRD.md` — the dashboard route itself only requires a valid session; individual mutating actions re-check for the `admin` role.
   - Guard Logic:
      - Auth Check: if `!loggedinUser` and route is private ⮕ redirect to the Gateway/Login route (`/`).
      - No onboarding/funnel check — Hila Tours has no multi-step account setup.

4. **Global Layout Wrapper:**
   - Manage the main viewport container (e.g., `min-h-screen`, `bg-slate-50`).
   - Handle directionality at the HTML level: RTL, Hebrew only (`<html lang="he" dir="rtl">`) — no i18n infrastructure, no LTR fallback.

5. **Route Guard Implementation:**
   - Create a wrapper component `ProtectedRoute` for the `/admin` route.
   - Inside the guard:
      - Get the logged-in admin from the store.
      - If absent, redirect to `/`.
      - No further step-gating beyond this single check.

6. **Version Governance & Upgrade Orchestration**
   - Not in scope for v1 — no forced-update/version-governance UI. The native Android build via Capacitor reuses the same web build; there is no separate versioned release cadence requiring `UpgradeRequired`/`UpgradeRecommended` components.
   - Do not build these components speculatively — if this becomes a real requirement, scope it explicitly first, following a `Major/Minor/Patch` comparison approach, before adding it here.

# Tailwind Implementation Logic
- *Root Container:* `relative w-full min-h-screen overflow-x-hidden selection:bg-blue-100`.
- *Overlay Layer:* High `z-index` (e.g., `z-[9999]`) for the sonner `Toaster` container.
- *Modal Layer:* Admin login modal, seat-request modal, and any confirmation modals sit below the Toaster but above all page content.

# Files Structure
hila-tours/
└── frontend/
    └── src/
    │   ├── App.tsx                 # Main Logic & Routing
    │   ├── AppProviders.tsx        # Context/Store Providers
    │   └── main.tsx                # Entry point
