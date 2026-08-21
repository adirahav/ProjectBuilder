# Plan 020 — Create Signup page

- Status: done
- Owner: orchestrator
- Last updated: 2026-08-21
- Scope-Agents: none

## Goal
Evaluate the backlog task "Create Signup page" against the actual PRD/system design before building anything, because — as written — it assumes a self-registration flow that does not exist anywhere in this product (single seeded Admin, no customer accounts), and record the decision so the backlog item is closed out correctly rather than silently implemented against a screen the PRD never called for.

## Scope
- In scope: a documentation/decision-only pass — no code changes are proposed by this plan. This plan exists to make the PRD mismatch explicit, get it confirmed, and either (a) close the backlog item as not-applicable, or (b) hand off to a follow-up plan if review determines something narrower and real is actually wanted.
- Out of scope: creating a new Signup/registration page under `frontend/src/pages/`, adding any registration API route in `backend/user-service/`, and any related routing/i18n work — none of these are justified by the PRD as it stands.
- Repo-relative scope: none — this plan makes no file changes. If a follow-up plan is later approved, it would touch `frontend/src/pages/` (new page) and possibly `backend/user-service/` (new route) and `frontend/src/App.tsx` / router config for a new route.

## Assumptions
- The PRD (`Screens` section) defines exactly one auth-adjacent screen: "Screen 5 — Admin Login," with no Signup/Registration screen anywhere in Screens 1–7.
- Plan 011 ("Admin Login page and auth flow") already establishes: there is exactly one Admin account in v1, so no registration UI/route is needed; the account is created via a seed script or one-time bootstrap.
- Customers never have accounts at all (per PRD Overview: "no account needed" for booking) — so a Signup page aimed at Customers has no product purpose either.
- Plan 018 already reviewed and closed an equivalent mismatched task ("Add Login link in Signup page, and Signup link in Login page") as not-applicable for these same reasons. This task is the same underlying premise (a Signup page that was never part of the PRD), just phrased as the page-creation task directly instead of the cross-linking task.
- Given all of the above, the backlog task's premise (a Signup page needs to be created) does not correspond to any screen that exists or is planned in this codebase.

## Open Questions
1. Should this backlog item be closed as not-applicable given there is no Signup page and no self-registration flow anywhere in the PRD, and given Plan 018 already reached this same conclusion for the related cross-linking task?
   - Recommended: yes — close it as not-applicable. Building a Signup page would add an entire unplanned registration surface (new page, likely a new backend route in `backend/user-service/`, new auth-adjacent security review, new i18n keys) that contradicts the PRD's explicit single-seeded-Admin, no-self-registration model. If a real registration need has newly emerged (e.g. supporting a second Admin/staff account), the request should come back as its own PRD-driven backlog item with explicit scope, not be built from a bare "create signup page" title.
2. Is there a narrower, real task hiding inside this one — e.g. renaming/repurposing this backlog item toward something the PRD does call for (such as improving the existing `AdminLogin` page)?
   - Recommended: no new work here; if desired, that should be raised as its own explicit backlog item so its scope, i18n keys, and UX are deliberately planned rather than inferred from a mismatched "create signup page" title.

## Steps
1. No implementation steps — this plan documents the PRD/backlog mismatch for review.
2. Pending review confirmation (Open Question 1), mark this backlog item resolved as not-applicable; no files change as a result of this plan.
3. If review instead surfaces a narrower real task (Open Question 2), file it as a new numbered plan in `.plan/` with its own Scope-Agents rather than amending this one.

## Validation
- N/A — no code is added or modified by this plan. Validation consists of human confirmation that the PRD (Screens 1–7) and Plan 011 (Admin auth flow) indeed contain no Signup/registration screen, which is directly verifiable by reading those two documents.

## Risks
- **Risk of silently building unwanted scope**: if this plan were skipped and the task implemented literally, it would require inventing a Signup page and likely a registration API route that contradict the PRD's single-seeded-Admin model — a bigger, security-relevant change (new account-creation surface) smuggled in under a bare "create signup page" title. Flagging it here instead avoids that outcome.
- **No backend or frontend product code is touched by this plan itself**, so `frontend`, `api-gateway`, `user-service`, `booking-service`, `notification-service`, `qa`, and `security` are all correctly excluded from Scope-Agents (`none`).

## Rollout Order
1. Circulate this plan for review/confirmation of Open Question 1.
2. Close the backlog item as not-applicable once confirmed (or spin off a new plan per Open Question 2 if warranted).

## Rollback
- N/A — no files are created or modified by this plan.
