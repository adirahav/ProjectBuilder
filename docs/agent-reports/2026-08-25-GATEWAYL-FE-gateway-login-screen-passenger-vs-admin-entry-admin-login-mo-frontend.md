All checks green. Here's what I built.

**Gateway (Screen 1)** — `GatewayPage` at `/`, matching `docs/design/mockups/gateway-login.html`: brand block, entry-choice card with the single accent "המשך כנוסע" CTA (straight to `/tours`, no auth, no modal), an "או" divider, the secondary "כניסת מנהל" button, and the `/signup` discoverability link. Emoji stand-ins were swapped for Lucide icons per design-notes.

**Admin login modal** — a reusable accessible `Modal` shell (scrim `rgba(11,58,71,.55)`, `rounded-xl`, `shadow-lg`, 480px) with focus-in/focus-restore, Tab trapping, Escape + scrim dismissal, and body-scroll lock; `AdminLoginModal` layers the form on top. On failure the modal stays open and editable and shows one generic inline message for every credential failure mode — no navigation, no leak of which accounts exist.

**Three decisions worth flagging:**

1. **`http.service.ts` 401 handling changed.** Its global "401 → wipe auth + redirect" would have slammed the login modal shut on a bad password, since login legitimately answers 401. A 401 now only counts as session expiry when the request actually carried a session (`withAuth: true`); `withAuth: false` calls fall through to normal error classification. I also pointed `LOGIN_PATH` at `/` — it was `/login`, a route that has never existed.
2. **The login field is labeled "אימייל", not the mockup's "שם משתמש"** — per the plan's Open Question 3 resolution, since the `User` model has no `username` field and signup collects email.
3. **`HomePage.tsx` deleted.** It was the scaffold placeholder at `/` that this screen replaces.

Placeholders were added at `/tours` and `/admin` so neither navigation target 404s. `/admin` is *not* a guard — it renders an honest "login required" state when there's no admin session rather than faking an authenticated shell, since protected routing is explicitly out of scope here.

I did not launch the dev server, so the screen hasn't been visually confirmed in a browser — worth a look before QA signs off.

=== FRONTEND AGENT REPORT ===
```
Ticket: GATEWAYL-FE
Pages built/changed:
  - frontend/src/pages/GatewayPage.tsx (new — Screen 1)
  - frontend/src/pages/ToursPage.tsx (new — Screen 3 placeholder)
  - frontend/src/pages/AdminPage.tsx (new — Screen 4 placeholder)
  - frontend/src/pages/HomePage.tsx (deleted — scaffold placeholder replaced by Gateway)
  - frontend/src/App.tsx (routes: / , /tours, /admin)
Components built/changed:
  - frontend/src/components/Modal.tsx (new — accessible modal shell)
  - frontend/src/components/auth/AdminLoginModal.tsx (new)
Services built/changed:
  - frontend/src/services/auth.service.ts (+ login())
  - frontend/src/services/http.service.ts (401 = session expiry only when withAuth; LOGIN_PATH -> "/")
Store slices built/changed:
  - frontend/src/store/slices/auth.slice.ts (+ isAdminSession, derived from server roles)
Types/utils changed:
  - frontend/src/types/auth.types.ts (LoginPayload, LoginResponse, LoginFieldErrors)
  - frontend/src/utils/auth.utils.ts (+ validateLogin; hasFieldErrors now ignores cleared keys)
Lint: PASS
Build: PASS
Tests: 89 passed, 0 failed (6 files)
API contracts:
  - docs/api-contract/api-contract.user-management-service.yaml

Handoff to Backend Agent:
- Implement POST /api/auth/login per the contract above
- Admin-only: reject valid non-admin accounts with the SAME 401 as a wrong password
- Uniform failure: unknown email / wrong password / non-admin must be byte-identical
  responses (message "Invalid credentials", code INVALID_CREDENTIALS); use a dummy
  hash comparison on unknown email so timing doesn't distinguish them either
- Do not enforce the signup password policy on login; the stored hash is the authority
- Never log, echo, or return the submitted password; JWT must carry an expiry claim
- See .rule/database-rules.md for collection schemas

Notes / follow-ups:
- E2E tests (incl. the two-simultaneous-seat-request 409 case) are not in scope here —
  no seat feature or e2e framework exists yet; that belongs with Screen 3's ticket.
- /tours and /admin are placeholders; their own plans replace the bodies.
- Route guarding for /admin remains a follow-up (out of scope per plan 006).
- Not visually verified in a browser — dev server not launched per workflow rules.
```

STATUS: DONE