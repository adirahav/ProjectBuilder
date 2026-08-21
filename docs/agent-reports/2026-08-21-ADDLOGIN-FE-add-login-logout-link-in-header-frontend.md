All checks pass. The header now shows a "Log in" link when signed out and the Admin's identity plus a "Log out" button when signed in, gated on `isHydratingAuth` to avoid a signed-out flash on refresh. No backend surface was touched, so no API contract file was written.

=== FRONTEND AGENT REPORT ===
```
Ticket: ADDLOGIN-FE
Pages built/changed: none
Components built/changed:
  - frontend/src/components/layout/AppHeader.tsx (conditional Login link / Logout button + identity label)
  - frontend/src/components/layout/AppHeader.test.tsx (new — 5 unit tests)
  - frontend/src/i18n/strings.ts (header.authAria, header.login, header.logout, header.signedInAs, header.logout.toast — en + he)
Services built/changed: none (reuses existing auth.service via the auth slice)
Store slices built/changed: none (reads existing token/admin/isHydratingAuth, calls existing logout())
Lint: PASS
Build: PASS
Tests: 519 passed, 0 failed (29 files, includes the 5 new AppHeader tests)
API contracts:
  - none — this ticket adds no new or changed backend endpoints (Plan 017 explicitly excludes backend scope)

Notes:
- Logout redirects to `/` (public home) per Open Question 1 recommendation.
- Identity shown as "Signed in as {email}" from the cached AdminIdentity, truncated and hidden below `md` (Open Question 2); the Logout button stands alone when no email is cached.
- Affordance is global (visible on public routes too), matching LanguageToggle (Open Question 3).
- Icons are `aria-hidden`; both controls carry real text labels and a focus-visible ring. RTL handled via logical spacing and `rtl:-scale-x-100` on the directional icons.
- Not visually launched (no dev server per workflow rules) — manual check of Hebrew/English header rendering is worth a glance.

Handoff to Backend Agent:
- Nothing to implement for this ticket; the client-only logout inherited from Plan 011 remains unchanged (no server-side token revocation), which the security agent is scoped to confirm.
```

STATUS: DONE