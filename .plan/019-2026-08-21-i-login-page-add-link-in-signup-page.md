# Plan 019 — In Login page, Add link in Signup page

- Status: draft
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: none

## Goal
Evaluate the backlog task "Iמ Login page, Add link in Signup page" (garbled title, read as "In Login page, add link in Signup page") against the PRD and existing plans, and record that it is a duplicate of the already-resolved Plan 018 ("Add Login link in Signup page, and Signup link in Login page"), which found no Signup/registration page exists anywhere in this product. This plan closes the duplicate backlog item rather than re-implementing a decision already made.

## Scope
- In scope: a documentation/decision-only pass — no code changes are proposed by this plan. Confirm the duplication against Plan 018 and record the same conclusion for this backlog entry.
- Out of scope: creating a Signup/registration page, adding any registration API route in `backend/user-service/`, or modifying `frontend/src/pages/AdminLogin/AdminLogin.tsx` — none are justified by the PRD, and Plan 018 already reached this conclusion.
- Repo-relative scope: none — this plan makes no file changes.

## Assumptions
- The task title is a corrupted/duplicate rendering of the backlog item already addressed by `.plan/018-2026-08-21-add-login-link-in-signup-page-and-signup-link-in-login-page.md` (Status: done), which concluded there is no Signup page in this product.
- The PRD's `Screens` section (Screens 1–7) defines exactly one auth-adjacent screen — "Screen 5 — Admin Login" — with no Signup/Registration screen.
- Plan 011 ("Admin Login page and auth flow") deliberately implemented a single-seeded-Admin model with no self-registration UI or route, per PRD's "the single Admin."
- Nothing in the codebase or PRD has changed since Plan 018's decision that would justify a different outcome here.

## Open Questions
1. Should this backlog item be closed as a duplicate of Plan 018, with the same not-applicable resolution (no Signup page exists or is planned)?
   - Recommended: yes — close as duplicate/not-applicable, referencing Plan 018's reasoning directly rather than re-deriving it. If a genuine need for a second account type (e.g. staff self-service) emerges later, it should be filed as its own PRD-driven backlog item, not inferred from this link-only task.

## Steps
1. No implementation steps — this plan documents the duplication and confirms Plan 018's decision still applies.
2. Pending review confirmation (Open Question 1), mark this backlog item resolved as a duplicate of Plan 018; no files change as a result of this plan.

## Validation
- N/A — no code is added or modified. Validation is human confirmation that this backlog item restates Plan 018's already-resolved premise, verifiable by comparing this plan's Goal/Assumptions against `.plan/018-2026-08-21-add-login-link-in-signup-page-and-signup-link-in-login-page.md`.

## Risks
- **Risk of duplicate rework**: without this plan, the task could be re-implemented from scratch (inventing a Signup page and registration route) despite Plan 018 already rejecting that approach — wasted effort and an unplanned account-creation surface. Flagging the duplication here avoids that.
- No product code is touched by this plan itself, so `frontend`, `api-gateway`, `user-service`, `booking-service`, `notification-service`, `qa`, and `security` are all correctly excluded from Scope-Agents (`none`).

## Rollout Order
1. Circulate this plan for review/confirmation of Open Question 1.
2. Close the backlog item as a duplicate of Plan 018 once confirmed.

## Rollback
- N/A — no files are created or modified by this plan.
