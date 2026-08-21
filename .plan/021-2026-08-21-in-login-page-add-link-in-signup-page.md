# Plan 021 — In Login page, Add link in Signup page

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: none

## Goal
Evaluate the backlog task "In Login page, Add link in Signup page" against the PRD and existing plans, and record that it is a repeat of the already-resolved Plan 018 ("Add Login link in Signup page, and Signup link in Login page") and Plan 019 (an earlier duplicate of the same task), both of which found — and Plan 020 ("Create Signup page") reconfirmed — that no Signup/registration page exists or is planned anywhere in this product. This plan closes the duplicate backlog item rather than re-implementing a decision already made three times.

## Scope
- In scope: a documentation/decision-only pass — no code changes are proposed by this plan. Confirm the duplication against Plans 018, 019, and 020, verify the codebase still has no Signup page (`frontend/src/pages/` contains only `AdminLoginPage.tsx`/`AdminLoginPage.test.tsx` for auth-adjacent screens, no Signup page), and record the same not-applicable conclusion for this backlog entry.
- Out of scope: creating a Signup/registration page, adding any registration API route in `backend/user-service/`, or modifying `frontend/src/pages/AdminLoginPage.tsx` — none are justified by the PRD, and Plans 018/019/020 already reached this conclusion.
- Repo-relative scope: none — this plan makes no file changes.

## Assumptions
- The task title is a repeat/duplicate rendering of the backlog item already addressed by `.plan/018-2026-08-21-add-login-link-in-signup-page-and-signup-link-in-login-page.md` (Status: done) and `.plan/019-2026-08-21-i-login-page-add-link-in-signup-page.md` (Status: done), both of which concluded there is no Signup page in this product.
- `.plan/020-2026-08-21-create-signup-page.md` (Status: done) independently reconfirmed the same conclusion when evaluating a "create the Signup page" task directly.
- The PRD's `Screens` section (Screens 1–7) defines exactly one auth-adjacent screen — "Screen 5 — Admin Login" — with no Signup/Registration screen.
- Plan 011 ("Admin Login page and auth flow") deliberately implemented a single-seeded-Admin model with no self-registration UI or route, per PRD's "the single Admin."
- A current check of `frontend/src/pages/` confirms only `AdminLoginPage.tsx` and its test exist for auth; no Signup page has been added since Plans 018/019/020 were closed.

## Open Questions
1. Should this backlog item be closed as a duplicate of Plans 018/019/020, with the same not-applicable resolution (no Signup page exists or is planned)?
   - Recommended: yes — close as duplicate/not-applicable, referencing Plans 018, 019, and 020's reasoning directly rather than re-deriving it a fourth time. If a genuine need for a second account type (e.g. staff self-service) emerges later, it should be filed as its own PRD-driven backlog item, not inferred from this link-only task. Consider also flagging the backlog itself, since this is the third time an equivalent Signup-related item has surfaced — deduplicating the backlog source may prevent further repeat planning cycles.

## Steps
1. No implementation steps — this plan documents the duplication and confirms Plans 018/019/020's decision still applies.
2. Pending review confirmation (Open Question 1), mark this backlog item resolved as a duplicate of Plans 018/019/020; no files change as a result of this plan.

## Validation
- N/A — no code is added or modified. Validation is human confirmation that this backlog item restates Plans 018/019/020's already-resolved premise, verifiable by comparing this plan's Goal/Assumptions against those plan files and by the `frontend/src/pages/` listing showing no Signup page present.

## Risks
- **Risk of duplicate rework**: without this plan, the task could be re-implemented from scratch (inventing a Signup page and registration route) despite Plans 018/019/020 already rejecting that approach — wasted effort and an unplanned account-creation surface. Flagging the duplication here avoids that.
- **Risk of recurring backlog noise**: this is now the third near-identical Signup-link backlog item closed as not-applicable; if the backlog source keeps regenerating it, future cycles will keep re-spending planning effort on the same resolved question.
- No product code is touched by this plan itself, so `frontend`, `api-gateway`, `user-service`, `booking-service`, `notification-service`, `qa`, and `security` are all correctly excluded from Scope-Agents (`none`).

## Rollout Order
1. Circulate this plan for review/confirmation of Open Question 1.
2. Close the backlog item as a duplicate of Plans 018/019/020 once confirmed.

## Rollback
- N/A — no files are created or modified by this plan.
