Screen 5 (Admin Login) is built end-to-end on the frontend, along with the `ProtectedRoute` guard and the JWT plumbing every future Admin screen will sit on.

**Key implementation decisions**

- **Two origins, one transport.** `http.service.ts` now builds one axios client per origin — `booking-service` for the public booking screens, `api-gateway` for Admin routes (PRD F5–F11 all say "via `api-gateway`"). Both share the same request/response interceptors, so the token attachment and the global 401 handling stay in exactly one place. New env var `VITE_API_GATEWAY_URL`, documented in `.env.example`.
- **A rejected login is not an expired session.** The global 401 interceptor deliberately skips `/api/auth/login` — otherwise a wrong password would wipe state and bounce the Admin off the form they're standing on. The login 401 renders as an inline `role="alert"` beside the form (it must persist while they retype); genuine failures still toast.
- **No user enumeration in the UI.** The error never says which half was wrong, matching the generic server message. There's a test asserting that.
- **Hydration before guarding.** The persisted token is read asynchronously, so the first paint after a refresh legitimately says "no token". `ProtectedRoute` renders a `role="status"` loading notice until `isHydratingAuth` clears — without it, every reload would sign the Admin out. `ProtectedRoute` also records `location.pathname` so signing in returns them where they were headed.
- Followed the repo's existing conventions rather than the plan's literal paths: `services/auth.service.ts` + `store/slices/auth.slice.ts` (not `api/auth.ts` + `store/auth.ts`), and `AdminLoginPage.tsx` per `.rule/naming-rules.md`.
- `auth.service.ts` uses a namespace import of `http.service`. Reading named bindings at module scope broke 22 unrelated tests the moment the store started depending on it, since several test files mock `http.service` partially — all access is now lazy.

**One thing to flag:** there is no separate e2e framework in this repo; the multi-screen flows are covered by Testing-Library tests that mount the real router (the existing convention). The Admin login → guard → dashboard → sign-out flow is covered that way, but no browser-level e2e runner was added.

=== FRONTEND AGENT REPORT ===
```
Ticket: ADMINLOG-FE
Pages built/changed: AdminLoginPage.tsx (new), AdminDashboardPage.tsx (new, placeholder pending Screens 6-7), App.tsx (routes + session bootstrap)
Components built/changed: ProtectedRoute.tsx (new), admin/AdminLoginForm.tsx (new), common/FormField.tsx (password type + accessible reveal toggle)
Services built/changed: auth.service.ts (new), http.service.ts (per-origin clients, gateway client, token persistence, login-401 exemption)
Store slices built/changed: auth.slice.ts (new), store.ts (RootState + spread)
Types/utils: types/auth.types.ts, utils/auth.utils.ts (new)
i18n: adminLogin.* and admin.* keys, Hebrew + English
Lint: PASS
Build: PASS
Tests: 304 passed, 0 failed (21 files; 60 new across auth.utils, auth.service, http.service, auth.slice, AdminLoginPage)
API contracts:
  - docs/api-contract/api-contract.api-gateway.yaml

Handoff to Backend Agent:
- Implement endpoints per service contract above
- POST /api/auth/login on api-gateway: unauthenticated, proxies to user-service, returns { token, admin: { id, email } }
- Request body is { identifier, password } — identifier accepts email OR username (PRD Screen 5)
- 401 body must be generic and identical for unknown identifier and wrong password (no user enumeration); 400 for missing fields
- JWT: admin id + fixed role claim, 24h expiry, no refresh token in v1
- verifyJwt middleware must accept `Authorization: Bearer <token>` — the frontend attaches it to every request once a token is stored
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```