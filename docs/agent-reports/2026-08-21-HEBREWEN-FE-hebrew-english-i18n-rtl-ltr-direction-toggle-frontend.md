Audit complete and both gaps closed.

**What I found:** Plans 007–013 had already built most of plan 014's target state incrementally — the dictionary (`i18n/strings.ts`) already covers all 7 screens in both languages, `useI18n`/`app.slice` already own a single global locale with localStorage persistence, `AppHeader` already renders `LanguageToggle` on every route including Admin Login, and my greps found **zero** hardcoded JSX strings and **zero** physical-direction Tailwind utilities (steps 1–12 were effectively already satisfied; directional icons already use `rtl:rotate-180` / `rtl:-scale-x-100`).

**Two genuine defects I found and fixed:**

1. **RTL bug in the Admin Appointments table** (`AdminAppointmentTable.tsx`) — the wall-clock range was the one place in the app rendering `formatTimeRange` without `dir="ltr"` isolation (SlotButton, ConfirmationSummary and CustomerDetailsPage all had it). In the RTL table the bidi algorithm swaps the two sides, so `09:00 – 10:30` displays as an appointment that ends before it starts. Added the isolation plus `items-start` on the wrapper so forcing the direction doesn't drag the time out from under its date.

2. **Flash of the wrong language on load** (`App.tsx`) — `isHydratingLocale` was computed but never consumed anywhere. Since the persisted locale is read asynchronously (Capacitor Preferences on native, not a sync localStorage hit), a returning English user saw the full Hebrew/RTL default paint first and then flip. `AppRoutes` now withholds the shell until that read lands, which is what the plan's "respecting the persisted choice on initial load" validation item actually requires.

Test setup was updated so page tests start on the far side of hydration (they're about post-hydration rendering), and the gate itself is covered explicitly by a new test that opts back in.

=== FRONTEND AGENT REPORT ===
```
Ticket: HEBREWEN-FE
Pages built/changed: App.tsx (AppRoutes locale-hydration gate); all 7 screens audited, no other page changes needed
Services built/changed: none
Store slices built/changed: none (app.slice audited — isHydratingLocale now actually consumed)
Components changed: components/admin/AdminAppointmentTable.tsx
Tests changed: src/test/setup.ts, pages/ServiceListPage.test.tsx (+1), pages/AdminAppointmentsPage.test.tsx (+1)
Lint: PASS
Build: PASS
Tests: 470 passed, 0 failed (25 files)
API contracts:
  - none — frontend-only presentation refactor, no new or changed endpoints

Handoff to Backend Agent:
- No backend work required for this ticket.

Manual visual confirmation still worth doing (I do not launch dev servers):
- Toggle he/en on all 7 screens and confirm direction, icon flip and date/price formatting.
```

STATUS: DONE