# Product Definition

<!--
TEMPLATE — QUESTION-DRIVEN, not fill-in-the-blank. Unlike the .rule/.claude/agents templates,
this file has no {{PLACEHOLDER}} markers — its content IS the product, which must be authored
fresh per project, not adapted from the Reference App's seat-booking domain. For each section below,
interview the user with the listed questions, then WRITE the section in prose (matching the
depth/tone of the reference sentence given per section), replacing the instruction
block. Do not leave any "<!-- ... -->" instruction text in the finished file.

Ask 2-4 questions at a time, not the whole file at once. Work top to bottom — later sections
(Scope, Constraints) depend on earlier ones (Vision, Users) being settled first.
-->

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
<!--
Ask: "In one or two sentences, what does this product remove/replace/enable that's manual or
painful today?" Reference depth: "This product removes the manual work of seating
passengers on tour buses. Instead of an admin figuring out by hand who sits where, the admin
sets up a tour with its buses and pickup points, and passengers browse the tour and request
their own seat — the admin approves, manages, and finalizes the seating from there."
Write 2-4 sentences here once answered.
-->

---

## Target Users
<!--
Ask: "Who are the primary users (the ones with the main workflow/pain), and who are the
secondary users (if any)?" For each: what are they trying to accomplish, what's their core need.
Reference depth: distinguished "admins/tour managers" (primary — run tours, want
to avoid manual seating) from "passengers" (secondary — want a live seat map and self-service
seat pick). If this project has only one user type, say so explicitly rather than forcing a
primary/secondary split.
Write one subsection per user type once answered.
-->

---

## Problem Statement
<!--
Ask: "What breaks or gets painful today without this product, and for whom specifically?"
Reference depth: one paragraph connecting the manual-seating pain for admins to
the lack of visibility/control for passengers, and how the product resolves both sides.
Write one paragraph here once answered.
-->

---

## Value Proposition
<!--
Ask: "What's the core value delivered, and what are 3-4 concrete differentiators from doing
this manually or with a generic tool?"
Reference depth: one paragraph + a "Key differentiators" bullet list of 3-4 items.
Write here once answered.
-->

**Key differentiators:**
- <fill in>

---

## Product Scope

<!--
Ask: "What's in scope for v1 — list every major feature area." Then: "What's explicitly out of
scope for v1, and why (deferred vs. never)?" Cross-check against the entities/roles/contested-
resource already established when this project's other config files were filled in (if this
file is being written first, note that those other files should stay consistent with what's
decided here).
Reference depth: a bulleted "In scope" list (~8 items, each one line, referencing
the owning rule/skill file where relevant) and a bulleted "Out of scope (v1)" list (~6 items,
each noting briefly why it's deferred).
-->

**In scope:**
- <fill in>

**Out of scope (v1):**
- <fill in>

---

## Success Metrics
<!--
Ask: "What business metrics and product metrics would tell you this is working?" It's fine if
exact targets are TBD — note that explicitly rather than inventing numbers.
Reference depth: "Business metrics" (2 items) + "Product metrics" (3 items), each
one line, with a closing note that baselines are TBD until real usage data exists.
-->

**Business metrics:**
- <fill in>

**Product metrics:**
- <fill in>

*Baseline values to be defined after first real usage.*

---

## Constraints and Assumptions
<!--
Ask: "What hard constraints does this product operate under (auth requirements, no-instant-
confirmation rules, etc.)?" and "What assumptions are you making that should be validated later
(e.g. about user behavior, scale, org structure)?"
Reference depth: "Constraints" (3 bullets, each a hard rule) + "Assumptions to
validate" (4 bullets, each an open question to revisit later).
-->

**Constraints:**
- <fill in>

**Assumptions to validate:**
- <fill in>

---

## Prioritization Rules
<!--
Ask: "When two features compete for attention, what should generally win?" Keep this short —
3-5 rules of thumb, not a full roadmap.
Reference depth: 4 one-line prioritization rules (reduce manual workload, lower
friction on the core flow, defer speculative scope, avoid premature complexity).
-->

- <fill in>

---

## Update Triggers
List the kinds of changes that should trigger someone to revisit this file — e.g. a new user
segment, a scope change, a metric revision, a new platform target. (This section's shape is
reusable as-is; just adapt the specific triggers to this product.)
