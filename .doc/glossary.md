# Glossary

<!--
TEMPLATE — QUESTION-DRIVEN. Build this AFTER product-definition.md, and ideally alongside/before
.rule/naming-rules.md (they must stay in sync — naming-rules.md's {{ENTITIES}}/{{ACTION_VERBS}}
placeholders should be filled with exactly the terms decided here).

For each domain entity/role/action verb from product-definition.md's Scope section, ask:
"What's the canonical term for this, and what synonyms should be explicitly banned?" (e.g. a
team member might say "order" when the canonical term is "booking" — capture that here so it
never drifts). Also ask about any naming-collision risk (two unrelated concepts that could be
confused because they share a word — the reference project this template came from had this with a `user` role vs. `passenger`).

Write one "### `<term>`" entry per concept, following the shape below. Delete the instruction
blocks once every entity/role/action/status is documented.
-->

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

<!--
For each domain entity (from product-definition.md's data model / scope), write an entry:

### `<term>`
- **Canonical meaning:** <one sentence>
- **Use:** Always `<term>`, not `<synonym-1>`, `<synonym-2>`, or `<synonym-3>`. State plainly
  whether this is a hard rule or a style preference.
- **Plural:** `<plural form>`

If the entity has a status/lifecycle field, add a variants list:

### `<entity>Status`
- **Canonical meaning:** The current state of `<entity>` in its lifecycle.
- **Variants:** list every status value with a one-line meaning each.
- **Use:** Always these exact values — no alternate casing, translations, or synonyms.

For each key action/operation verb (approve, cancel, etc. — whatever this product's core
actions are), write:

### `<actionVerb>`
- **Canonical meaning:** <what it does, in domain terms>
- **Use:** Always `<actionVerb>`, not `<synonym-1>` or `<synonym-2>`.

For each role (from product-definition.md's Target Users), write:

### `<role>`
- **Canonical meaning:** <who they are, what they can do>
- **Use:** Always `<role>` in code/API; note any product-facing alternate term (e.g. "manager"
  in UI copy) and confirm the two refer to the same thing, not two different concepts.

If two terms risk being confused because they share a word or are conceptually adjacent (e.g.
a permission "role" named the same as an unrelated user-facing term), add an explicit
"⚠️ Naming collision to be aware of" callout under the more specific term, spelling out exactly
how the two differ and why they must never be conflated.
-->

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md`.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.
