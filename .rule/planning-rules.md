# Planning Rules

## Purpose
- Define how plans are created, reviewed, and executed in this repository.

## Plan Location and Lifecycle
- Treat `.plan/` at the repository root as the source of truth for plans.
- For any plan-related request, first read existing `.plan/*.md` plans, even when no specific plan file is referenced.
- Save every new or updated implementation plan as a Markdown file in `.plan/`.
- If `.plan/` does not exist, create it before writing plan files.

## File Naming
- Use this filename format for new plans: `001-YYYY-MM-DD-<topic>.md`.
- Use sequential numeric prefixes: `001`, `002`, `003`, and so on.

## Collaboration Rules
- Ask all plan questions directly in the plan file.
- Make questions easy to respond to, and include a recommended answer when possible.
- After answers are provided, update the plan accordingly.
- Request approval before executing the plan.
- **Never write a `*HUMAN ANSWER:*` line yourself.** That line represents literal text a human typed at the terminal review prompt — it must never be fabricated, inferred, or pre-filled with "as recommended" by the planning agent, including on the very first draft. Only a genuine revision pass, made after real terminal feedback was received, may add a `*HUMAN ANSWER:*` line — and only for the specific question(s) that feedback actually addressed, verbatim or a faithful paraphrase of what was typed. If you see this pattern in prior plan files, that reflects a real approval that already happened for that plan — it is not a template to reproduce in a new plan you are drafting now.
- Each Open Question gets **exactly one** answer line, formatted `- Recommended: <your answer and reasoning>`. Do not add a second line that restates, echoes, or labels the same answer again — that's a duplicate, not new information, and it must not appear on a freshly generated draft.

## Content Rules
- Use repository-relative paths in plan content.
- Do not use machine-specific absolute paths.
- When a plan touches multiple services and the frontend, state explicitly which repo-relative folder each step belongs to so cross-service work isn't ambiguous.

## Required Plan Metadata
- Include these fields near the top of each plan:
	- `Status:` `draft|active|done|superseded`
	- `Owner:`
	- `Last updated:` `YYYY-MM-DD`
	- `Scope-Agents:` comma-separated subset of `frontend, appointment-service, catalog-service, user-management-service, api-gateway, qa, security` — or `none` for pure tooling/config tasks with no product code. This is machine-parsed by the orchestrator to decide which agents actually run for this task, so it must be accurate, not a default.
		- Include `qa` unless the task genuinely has nothing to validate (e.g. dependency installs).
		- Include a backend service only if this task adds/changes code in it, OR — even when only "confirming" existing endpoints — the `Risks` section of this same plan calls out a concurrency, auth, or data-integrity risk in that service. Do not exclude a backend service solely because "no new endpoints are expected" if the Risks section says otherwise; that self-contradiction is a known planning mistake.
		- Include a gateway/deploy service only when the task's own Steps section assigns it work — omitting it from this line while still describing it as a deliverable in Steps is the same self-contradiction: the orchestrator only launches agents listed here, regardless of what Steps says.
		- Include `security` for anything touching auth, admin mutations, PII, or an integration point — not only for tasks that add brand-new endpoints.

## Required Plan Sections
- Every plan must include:
	- `Goal`
	- `Scope`
	- `Assumptions`
	- `Open Questions`
	- `Steps`
	- `Validation`
	- `Risks`
	- `Rollout Order`
	- `Rollback`

## Supersession Rule
- If a plan is replaced, mark the old plan `Status: superseded` and add a link to the replacing plan.
