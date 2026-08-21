Verified against the approved plan: this ticket is a duplicate of Plans 018/019/020, all of which concluded no Signup page exists or is planned in this product. The PRD defines only one auth screen (Screen 5 — Admin Login), and `frontend/src/pages/` confirms only `AdminLoginPage.tsx` exists for auth. Plan 021 explicitly specifies **no code changes** and lists `Scope-Agents: none`.

I therefore made no code changes. There is no Signup page to link to, so adding a "Sign up" link in `AdminLoginPage.tsx` would create a dead route and an unplanned account-creation surface, contradicting the single-seeded-Admin model from Plan 011.

Lint and build were run to confirm the tree is clean and unchanged — both pass.

**Recommendation:** close this backlog item as a duplicate, and dedupe the backlog source — this is the fourth equivalent Signup-related item. If staff self-service accounts are genuinely wanted, file it as a PRD-driven feature ticket, not a link-only task.

=== FRONTEND AGENT REPORT ===
```
Ticket: INLOGINP-FE
Pages built/changed: none — no code changes (duplicate of Plans 018/019/020; no Signup page exists or is planned)
Services built/changed: none
Store slices built/changed: none
Lint: PASS
Build: PASS
Tests: not in scope for this ticket
API contracts:
  - none — no new/changed endpoints required

Handoff to Backend Agent:
- No backend work required for this ticket
- Recommend closing the backlog item as a duplicate of Plans 018/019/020
```

STATUS: DONE