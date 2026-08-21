# Plan 018 — Add Login link in Signup page, and Signup link in Login page

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: none

## Goal
Evaluate and resolve the backlog task "Add Login link in Signup page, and Signup link in Login page" against the actual PRD/system design, since — as written — it assumes a Signup page and a self-registration flow that do not exist anywhere in this product (single-Admin, no customer accounts), and record the decision so the backlog item is closed out correctly rather than silently implemented against a screen that was never built.

## Scope
- In scope: a documentation/decision-only pass — no code changes are proposed by this plan. This plan exists to make the mismatch explicit, get it confirmed, and either (a) close the backlog item as not applicable, or (b) hand off to a follow-up plan if review determines something narrower and real is actually wanted (e.g. a link from `AdminLogin` to a not-yet-existing Admin self-service page).
- Out of scope: creating a new Signup/registration page, adding any registration API route in `backend/user-service/`, or modifying `frontend/src/pages/AdminLogin/AdminLogin.tsx` — none of these are justified by the PRD as it stands.
- Repo-relative scope: none — this plan makes no file changes. If a follow-up plan is later approved, it would touch `frontend/src/pages/AdminLogin/AdminLogin.tsx` and (for a real Signup page) new files under `frontend/src/pages/`.

## Assumptions
- The PRD (`Screens` section) defines exactly one auth-adjacent screen: "Screen 5 — Admin Login," with no Signup/Registration screen anywhere in Screens 1–7.
- Plan 011 ("Admin Login page and auth flow") explicitly states: "There is exactly one Admin account in v1 (per PRD: 'the single Admin'), so no registration UI/route is needed; the account is created via a seed script or one-time bootstrap." This was a deliberate, already-implemented design decision, not an oversight.
- Customers never have accounts at all (per PRD Overview: "no account needed" for booking) — so a "Signup" link aimed at Customers has no page to point to either.
- Given both of the above, the backlog task's premise (a "Signup page" that needs a "Login" link, and a "Login page" that needs a "Signup" link) does not correspond to any screen that exists or is planned in this codebase.

## Open Questions
1. Should this backlog item be closed as not-applicable given there is no Signup page and no self-registration flow anywhere in the PRD or in Plan 011's already-implemented design?
   - Recommended: yes — close it as not-applicable. Building a Signup page solely to host a reciprocal link would add an entire unplanned registration surface (new page, likely a new backend route, new auth-adjacent security review) that contradicts the PRD's explicit single-seeded-Admin, no-self-registration model, purely to satisfy a cross-link that has no product justification on its own. If a real registration need has newly emerged (e.g. supporting a second Admin/staff account), the request should come back as its own PRD-driven backlog item, not be inferred from this link-only task.
2. Is there a narrower, real task hiding inside this one — e.g. the existing `AdminLogin` page should link somewhere else entirely (such as "forgot password" or a public "back to booking" link)?
   - Recommended: no new work here; if desired, that should be raised as its own explicit backlog item so its scope, i18n keys, and UX are deliberately planned rather than folded into a mismatched Signup/Login cross-link task.

## Steps
1. No implementation steps — this plan documents the PRD/backlog mismatch for review.
2. Pending review confirmation (Open Question 1), mark this backlog item resolved as not-applicable; no files change as a result of this plan.
3. If review instead surfaces a narrower real task (Open Question 2), file it as a new numbered plan in `.plan/` with its own Scope-Agents rather than amending this one.

## Validation
- N/A — no code is added or modified by this plan. Validation consists of human confirmation that the PRD (Screens 1–7) and Plan 011 (Admin auth flow) indeed contain no Signup/registration screen, which is directly verifiable by reading those two documents (already quoted above).

## Risks
- **Risk of silently building unwanted scope**: if this plan were skipped and the task implemented literally, it would require inventing a Signup page and likely a registration API route that contradict the PRD's single-seeded-Admin model — a bigger, security-relevant change (new account-creation surface) smuggled in under a "just add a link" description. Flagging it here instead avoids that outcome.
- **No backend or frontend product code is touched by this plan itself**, so `frontend`, `api-gateway`, `user-service`, `booking-service`, `notification-service`, `qa`, and `security` are all correctly excluded from Scope-Agents (`none`).

## Rollout Order
1. Circulate this plan for review/confirmation of Open Question 1.
2. Close the backlog item as not-applicable once confirmed (or spin off a new plan per Open Question 2 if warranted).

## Rollback
- N/A — no files are created or modified by this plan.
