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
