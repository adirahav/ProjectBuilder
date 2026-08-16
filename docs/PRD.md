# PRD — {{PROJECT_NAME}}

<!--
TEMPLATE — QUESTION-DRIVEN. Build this LAST among the four docs/.doc files — it's the most
concrete/UI-facing one and should already be able to lean on decisions made in
product-definition.md, glossary.md, and architecture.md rather than re-deciding them. Cross-check
every entity/action/route name against the glossary as you write, don't introduce new synonyms
here.

Work section by section per the instructions below, then delete every instruction block.
-->

**Version:** 1.0
**Design Source:** `{{DESIGN_SOURCE}}` (source of truth for colors, spacing, and component structure) — if Part 1 Q9 was "no design source yet," delete this line instead of filling it; the Frontend Agent designs per `.rule/style-rules.md` and has no external reference to match.
**Status:** In Development

---

## Overview
<!--
Ask: "Restate the product in 2-3 sentences, naming the audiences and the core workflow." This
should read like a tighter version of product-definition.md's Vision + Target Users, written for
someone about to review screens, not strategy.
-->

---

## Screens
<!--
Ask: "Walk me through every screen/view in the app, in the order a new user would encounter
them." For each screen, ask: "What's on it? What can the user do here? What happens when they
submit/act?" Write one "### Screen N — <Name>" subsection per screen, as a bullet list of what's
on it and what it does — match the density of the reference (each bullet is one concrete UI
element or behavior, not a vague description). If a screen has multiple modes/tabs (e.g. an
admin dashboard with sub-tabs), nest those as sub-bullets or sub-subsections.

Call out accessibility-relevant details inline where they apply (e.g. "status must never be
color alone — see accessibility-layer skill") rather than leaving them implicit.
-->

---

## Functional Requirements
<!--
Ask: "For each screen/capability above, what's the specific backend route or service that
powers it?" Build a table:

| ID  | Requirement | API Route / Service |
|-----|---|---|
| F1  | <one-line requirement, plain language> | `METHOD /api/path` (`<service-name>`) |

Number requirements sequentially (F1, F2, F1b for a closely-related sub-requirement, etc.).
Cover every screen's every action — this table should have no gaps relative to the Screens
section above.
-->

---

## Non-Functional Requirements
<!--
Ask about: direction/language (RTL/LTR, translated or not), real-time sync expectations, mobile/
responsive requirements, native platform targets, accessibility level (WCAG AA is the default
unless told otherwise), auth/security requirements per action, source-of-truth rules for any
contested entity, and the deletion model (soft vs. hard delete).
Write as a bullet list, one requirement per line, referencing the owning `.rule/*.md` file where
relevant (e.g. "see accessibility-layer skill", "see database-rules.md").
-->

---

## Acceptance Criteria
<!--
Ask: "For each functional requirement, what's the observable, testable behavior that proves it
works?" Number them AC-1, AC-2, etc. — aim for one AC per meaningfully distinct behavior (not
strictly 1:1 with functional requirements; some requirements need more than one AC, e.g. a
concurrency-sensitive action needs a "resolves the race correctly" AC in addition to a
"happy path" AC).
Include an AC for: the core happy-path flow(s), any concurrency-sensitive action (exactly one of
two simultaneous requests succeeds), the deletion model (soft-delete is invisible in list/get but
not actually removed), design fidelity to {{DESIGN_SOURCE}} (only if a design source exists — skip
this AC entirely if Part 1 Q9 was "no design source yet"), native build behavior if applicable,
accessibility (status conveyed without color alone, if there's a status-driven entity), and the
signup/permission edge case if RBAC with a no-permission default role exists.
-->

---

## Data Model
<!--
This section should be a SHORT pointer, not a re-derivation — the real field-level detail lives
in glossary.md (terminology) and database-rules.md (schema). Write one bullet per entity: name,
2-4 key fields, parent relationship if any, and whether it's soft-deleted.
-->
See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.

---

## Out of Scope (v1)
<!--
Pull directly from product-definition.md's "Out of scope" list, but add any UI/screen-specific
exclusions discovered while writing the Screens section above (e.g. a known naming mismatch
between a design reference and the canonical route names, if the design source predates the
naming decision).
-->
