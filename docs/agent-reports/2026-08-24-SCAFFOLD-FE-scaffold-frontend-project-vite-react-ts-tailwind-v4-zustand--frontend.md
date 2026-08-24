All checks pass. Final state verified: no `tailwind.config.js` (v4 CSS-first), `<html lang="he" dir="rtl">`, `backend/` untouched.

**Two deviations from the plan, both driven by the `.rule/*` files being source of truth:**

1. **Real design tokens instead of TBD placeholders.** The plan assumed `docs/design/mockups/` was empty, but it contains 4 approved mockups plus `design-notes.md`. Per `.rule/style-rules.md` ("extract the exact values used there — do not invent separate values"), I filled `@theme` with the real "Aegean" palette, seat-status fill/border/text triplets, the six-step type scale, Heebo font stack, and the three elevation levels. No later token-backfill ticket is needed.
2. **Added `sonner`.** Not in the plan's dependency list, but `.rule/ui-rules.md` mandates it for toasts and `.rule/error-handling-rules.md` requires a single Toaster mounted at the app root — so it's wired into `App.tsx` with `dir="rtl"`.

I also went slightly beyond bare skeletons where the rules dictated specific behavior: `http.service.ts` implements the global 401 session-expiry flow and classifies 409 as a distinct `ConflictError` (seat concurrency), and `util.service.ts` centralizes JWT storage behind an already-async API so the Capacitor Preferences path drops in later without a breaking change.

Note: I did not launch the dev server per your instructions — visual confirmation of the placeholder route is unverified, though I did confirm Tailwind emitted every custom token utility (`bg-n-50`, `text-h1`, `bg-primary-100`, etc.) into the built CSS, which was the plan's flagged "silently unstyled output" risk.

=== FRONTEND AGENT REPORT ===
```
Ticket: SCAFFOLD-FE
Pages built/changed: src/pages/HomePage.tsx (temporary placeholder route)
Services built/changed: src/services/http.service.ts, src/services/util.service.ts
Store slices built/changed: none (src/store/store.ts skeleton assembling zero slices)
Lint: PASS
Build: PASS
Tests: not in scope for this ticket
API contracts:
  - none (pure scaffolding — no endpoints introduced by this ticket)

Handoff to Backend Agent:
- No endpoints to implement yet; this ticket only stands up the frontend skeleton.
- Frontend expects VITE_TOUR_SERVICE_BASE_URL (4001) and VITE_USER_SERVICE_BASE_URL (4002).
- http.service.ts already assumes: Bearer JWT auth, 401 = session expiry, 409 = seat conflict,
  and a { message, code } JSON error body on all non-2xx responses.
- See .rule/database-rules.md for collection schemas
```

STATUS: DONE