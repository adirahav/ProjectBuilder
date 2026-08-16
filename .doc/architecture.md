# System Architecture

<!--
TEMPLATE — QUESTION-DRIVEN. Build this AFTER product-definition.md and glossary.md, and roughly
alongside/before the .rule/*.md and .claude/skills/*/SKILL.md templates — architecture.md is the
narrative version of decisions that also get encoded structurally in database-rules.md,
backend-service-layer/SKILL.md, etc. Keep terminology and the service/port list IDENTICAL across
all of them.

Work section by section, asking the questions noted in each block, then writing prose/tables in
that section's place. Delete every instruction block once the file is complete.
-->

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of `{{PROJECT_NAME}}`.

---

## System Overview
<!--
Ask: "Monorepo or polyrepo? One backend service or several — if several, what does each own?"
Draw the same two diagrams as the reference: a folder-tree box (frontend/ + backend/<services>)
and a client→services arrow diagram (browser, and native if applicable, hitting each service's
base URL).
-->

---

## Context
<!--
Ask: "What problem does this solve, in one sentence?" "What are the 3-5 hardest architectural
constraints — role split, concurrency-sensitive resource, ops/team-size constraints, patterns
reused from prior projects?"
Write "Problem solved" (1 sentence) + a "Key architectural constraints" bullet list.
-->

---

## Primary Components

<!--
For the frontend, ask: "What's the stack (framework, styling, state mgmt, HTTP client, auth
storage)?" and "What are the 2-3 main functional areas of the UI (e.g. an admin console vs. a
public-facing flow)?" Write a stack table + a short paragraph per functional area.

If native (Capacitor/RN) is in scope, add an "Android/iOS App" subsection: what wraps the web
build, what's different about storage/APIs on native, what's explicitly out of scope (e.g. no
iOS in v1).

For the backend, ask: "One table row per service — service name, its base-URL env var, its
responsibility." Then, if there's a contested/stateful entity: ask for its full lifecycle — every
state, every transition, and what triggers each one — and draw it as a small state-transition
diagram, the same shape as:
  available ──(action)──▶ pending ──(action)──▶ taken
Note which service each backend folder follows for its internal layout convention (controller/
service/routes/middleware per domain).
-->

---

## File Structure
<!--
Once the frontend and backend structures are settled (via the skill templates), mirror the real
folder tree here — this section should stay a straightforward reflection of the repo layout, not
a fresh design decision. Update it whenever the structure actually changes.
-->

---

## Data Flow
<!--
Ask: "Walk me through the 3-5 most important user journeys end to end (e.g. auth, the core
create flow, the core request/consume flow, the core management flow)." For each, write a small
arrow-diagram block in this shape:

<Actor> UI
  → METHOD BASE_URL/api/path             (what this call does)
  → METHOD BASE_URL/api/path/:id          (what this call does)
        → <resulting state change, if any>

Cover at minimum: the auth flow (what the token payload contains and why), and — if a contested
entity exists — its full request/approve/manage flow.
-->

---

## Auth and Org Boundaries
<!--
Ask: "Is authentication scoped to one role only, or multiple?" "Is there RBAC (roles/
permissions), or a simpler allow/deny model?" "If there are multiple services, how does a
non-issuing service authorize a request without calling back to the issuing service?" (Usual
answer: embed the minimal claims in the JWT payload at issuance — note the trade-off that a
permission change only takes effect on next login.) "What's the concurrency risk, if any, and
what's the mitigation (atomic update, transaction)?" "What's the deletion model — hard or soft
delete?"
Write this as a bulleted list of decisions, one per sub-topic, matching the reference file's
"Authentication / Authorization (RBAC) / Cross-service permission checking / Validation /
<actor> identity / Authorization scope / Concurrency / Deletion model" bullet structure.
-->

---

## API Reference
<!--
Once docs/api-contract/*.yaml or the equivalent OpenAPI files exist (built during the skill-
template phase), summarize each service's routes here as a method/route/purpose table, grouped
by resource. Treat this section as a living index into the real contract files, not the source
of truth itself.
-->

---

## External Dependencies
<!--
Ask: "Where does this deploy (hosting provider(s) for frontend/backend)?" "What's the primary
database and who owns the connection (confirm the frontend never connects directly)?" "Any other
third-party services (email, payments, storage, etc.)?"
Write as a Service / Purpose / Notes table.
-->

---

## Operational Concerns
<!--
Ask: "How is environment configuration handled (env vars per environment, no hardcoded URLs)?"
"What's the failure-isolation story if one service goes down — what still works, what doesn't?"
"Do frontend and backend deploy independently, and what does a breaking API change require?"
Write short bulleted subsections: Environment configuration / Failure isolation / Deployments.
-->

**Open questions / TBD:**
<!-- List anything still undecided — hosting provider, ownership model, identity model for an
unauthenticated actor, or any other structural question raised while filling this file in. -->

---

## Change Log
<!-- Add one dated bullet per architecturally-significant decision, going forward, matching the
reference file's style: date, then a one-line summary of what changed and why. -->
- {{TODAY'S DATE}}: Initial architecture defined.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.
