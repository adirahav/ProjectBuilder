# Frontend — Dog Grooming Appointment Booking System

React + Vite + TypeScript, Tailwind CSS v4 (CSS-first, no `tailwind.config.js`),
Zustand, Axios, `react-router-dom`, `sonner`, `lucide-react`, `framer-motion`.
Ships as a web build and, via Capacitor, as the Android/iOS build.

## Setup

```bash
npm install
cp .env.example .env      # required — see below
npm run dev
```

### Environment

| Variable | Purpose |
|---|---|
| `VITE_BOOKING_SERVICE_URL` | Base URL of `booking-service` (default dev value `http://localhost:4001`). The public booking routes are unauthenticated by design and are called directly rather than through `api-gateway`. |

There is no hardcoded fallback: if the variable is unset, requests fall back to a
relative path and a `[HTTP]` log warns about it, so a misconfiguration fails
visibly instead of silently hitting the wrong origin.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run lint` | ESLint over the whole package |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |
| `npm run cap:sync` | Production build, then copy it into `android/` and `ios/` |
| `npm run cap:open:android` | Open the Android project in Android Studio |
| `npm run cap:open:ios` | Open the Xcode project (macOS only) |

## Layout

```
src/
├── components/      # Presentational components, grouped by feature
│   ├── common/      # PageHeader, StateMessage, LanguageToggle, SkipLink
│   ├── layout/      # AppHeader
│   └── service/     # ServiceCard, ServiceList, ServiceListSkeleton
├── hooks/           # use<Name>.ts
├── i18n/            # strings.ts — the he/en phrase table
├── lib/             # cn() class-merge helper
├── native/          # Capacitor-only glue (back-button decision table + hook)
├── pages/           # <Name>Page.tsx — the "smart" data-orchestrating layer
├── services/        # <domain>.service.ts, all routed through http.service.ts
├── store/           # Zustand slices, assembled in store.ts
├── types/           # <domain>.types.ts
└── utils/           # <name>.utils.ts, logger.ts
```

Conventions are defined in `.rule/*.md` at the repo root — those files, not this
README, are the source of truth.

## Bilingual / RTL

Hebrew is the default locale and renders RTL; English renders LTR. The active
locale lives in `app.slice.ts`, persists across reloads (localStorage on web,
Capacitor Preferences on native), and drives `<html lang>` / `<html dir>`.
Styling uses Tailwind **logical** properties (`ps-*`/`pe-*`, `ms-*`/`me-*`,
`start-*`/`end-*`) so layouts mirror automatically — never `pl-*`/`pr-*`.

## Native (Capacitor) build

Android and iOS are wrappers around this same web build — there is no second
codebase. `capacitor.config.ts` points `webDir` at `dist/`, so the native
projects never hold hand-edited web assets.

```bash
npm run cap:sync            # build + copy into android/ and ios/
npm run cap:open:android    # then Run ▶ from Android Studio
npm run cap:open:ios        # macOS only; needs Xcode + CocoaPods
```

Re-run `cap:sync` after **every** change to `src/` — the native projects serve
the last copied `dist/`, not your dev server.

### Back-button behaviour

The Android hardware/gesture back button is handled by `src/native/`, per
`native-navigation-layer`:

- `backButtonLogic.ts` — a pure decision table (`pathname` + auth state + is-a-
  modal-open → action). All of the behaviour lives here so it is unit-testable
  without a device, since the real `backButton` event only fires on-device.
- `useNativeBackButton.ts` — a thin listener mounted once in `App.tsx`. It is
  gated on `Capacitor.isNativePlatform()`, so **web behaviour is unchanged** and
  no bridge listener is registered in a browser.

The rules it implements:

| Where | Back button does |
|---|---|
| Any open modal | Closes that modal only; the page underneath is untouched |
| `/` and `/admin` (signed in) | First press toasts "Press back again to exit"; a second press within 2s backgrounds the app |
| `/admin/login` | Goes to `/` (never exits the app) |
| A guarded `/admin/*` route with no token | Goes to `/`, matching the redirect already in flight |
| Booking flow, `/admin/services`, `/admin/appointments` | Steps back one history entry |

Open modals are found through an app-level registry (`store/slices/ui.slice.ts`)
that the shared `ModalDialog` primitive registers itself with. Any dialog built
on `ModalDialog` gets back-button dismissal for free — do not add per-dialog
wiring.

Safe-area insets (`env(safe-area-inset-*)`) are applied on `AppHeader` (top) and
the app shell (bottom); `index.html` sets `viewport-fit=cover`, without which
those insets always compute to 0 on device.

### Verified on-device manually

The listener wiring itself cannot be covered by jsdom. After `cap:sync`, check
on an emulator: double-press exit on `/` and on `/admin`; a single back-step
through the booking flow; a back press on each of `CancelAppointmentDialog`,
`DeactivateServiceDialog` and `ServiceForm` closing only the dialog; and that
back after logging in never returns to `/admin/login`.
