All checks pass. The prior run had completed the implementation and was interrupted only by a session limit — I verified every layer is correctly wired rather than rebuilding it.

**What's in place across the stack:**

- **Types** (`types/auth.types.ts`) — `StaffAccountDraft`, `StaffAccount`, `RegisterAdminResponse`, `CreateStaffAccountOutcome`. Response type deliberately carries no token/password.
- **Validation** (`utils/staffAccount.utils.ts`) — returns i18n *keys*, not sentences; trims name/email but never the password; lower-cases email so casing can't mint duplicate accounts; 72-byte password ceiling matching bcrypt's silent-truncation limit.
- **Service** (`services/auth.service.ts`) — `registerAdmin` posts through the shared authenticated client; `isDuplicateEmailError` keeps "409 means taken" out of the pages.
- **Slice** (`store/slices/auth.slice.ts`) — `createStaffAccount` returns an outcome instead of throwing; never touches `token`/`admin`; clears the confirmation on logout and on session end.
- **UI** — `AdminStaffAccountsPage` + `StaffAccountForm`, inline `role="alert"` errors (not color-only), `autoComplete="new-password"`, and a notice stating the new account has full Admin privileges so the UI doesn't imply roles that don't exist in v1.

**On the security regression the PRD names by name**, I checked specifically rather than assuming: a repo-wide search confirms no `/signup` or public `/register` route exists anywhere in `frontend/src` — every hit is either a comment explaining the absence, the authenticated `/api/auth/register` endpoint constant, or a test asserting the absence. `/admin/staff` sits inside `ProtectedRoute`, and the only link to it is the dashboard card behind auth.

One gap worth flagging honestly: **no E2E framework exists in this repo** (only vitest; no Playwright config). My CLAUDE.md mentions E2E coverage, but standing one up requires running live servers, which I'm instructed never to do as a verification step, and this ticket's plan specifies *manual* verification (Step 10) instead. I did not claim E2E coverage I don't have — the 102 staff-specific tests are unit/integration. Worth a dedicated ticket.

I also could not verify the app visually for the same reason — the duplicate-email and 401 paths depend on backend routes that don't exist yet, so plan Step 10's manual pass should run after the backend lands.

=== FRONTEND AGENT REPORT ===
```
Ticket: ADMINDAS-FE
Pages built/changed: AdminStaffAccountsPage.tsx (new), AdminDashboardPage.tsx (nav card), App.tsx (/admin/staff behind ProtectedRoute)
Components built/changed: components/admin/StaffAccountForm.tsx (new)
Services built/changed: services/auth.service.ts (registerAdmin, REGISTER_ENDPOINT, isDuplicateEmailError)
Store slices built/changed: store/slices/auth.slice.ts (createStaffAccount, clearCreatedStaffAccount, isCreatingStaffAccount, createdStaffAccount)
Utils/types/i18n: utils/staffAccount.utils.ts (new), types/auth.types.ts, i18n/strings.ts, test/factories.ts
Lint: PASS
Build: PASS
Tests: 592 passed, 0 failed (full suite, 31 files) — 102 of these cover this ticket
E2E: no framework in repo; not set up (requires live servers, which I must not launch). Recommend a dedicated ticket.
API contracts:
  - docs/api-contract/api-contract.api-gateway.yaml

Handoff to Backend Agent:
- Implement POST /api/auth/register per the gateway contract above
- CRITICAL: mount verifyJwt on the register ROUTE specifically, not the /api/auth prefix
  — gating the prefix locks out login; omitting it opens public Admin registration
- Return 201 (public fields only, no token/hash), 400 invalid, 401 no/bad token, 409 duplicate email
- POST /api/auth/login must remain public and unchanged
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```