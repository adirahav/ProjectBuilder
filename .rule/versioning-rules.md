# Versioning Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{SERVICES_AND_PORTS}}, {{CONTESTED_ENTITY}}
Ask the user: "Do independently-deployable services need independent version numbers?"
Delete this comment block once filled.
-->

## Purpose
- Define branch, commit, merge, and release versioning expectations for this repository.

## Core Principles
- Execute implementation work from a dedicated branch, not from main.
- Keep changes small, reviewable, and scoped to a single intent.
- Never commit, merge, or publish release tags without explicit approval.

## Branch Rules
- Create a new branch before executing an approved plan.
- Keep one plan or workstream per branch.
- Keep branch names predictable and lowercase using this pattern:
	- `task/<topic>` for new capabilities.
	- `bug/<topic>` for bug fixes.
	- `maintenance/<topic>` for maintenance.
	- `docs/<topic>` for documentation-only changes.
- Prefer singular domain terms in branch names when applicable — e.g. `task/<entity>-approve-flow`, `bug/<entity>-race-condition`.
- When a change spans both a service and the frontend, one branch can cover both — keep commits within it scoped by folder rather than splitting into two branches, unless the work is genuinely independent.

## Commit Rules
- Do not commit until the user explicitly approves committing.
- Keep commit messages concise and action-oriented.
- Use imperative commit subjects, for example: `add approve endpoint`, `fix pending-state race condition`.
- Avoid bundling unrelated changes in the same commit.

## Merge Rules
- Do not merge branches without explicit approval.
- Require at least one review pass before merge when collaboration is involved.
- Resolve comments and open questions before merge.
- For changes to `{{CONTESTED_ENTITY}}`'s state logic specifically, confirm the concurrency/race-condition behavior has been checked before merge — this is the highest-risk area in the codebase (see `testing-rules.md`).

## Versioning Model
- Use Semantic Versioning for releases: `MAJOR.MINOR.PATCH`.
- Increment `MAJOR` for breaking changes.
- Increment `MINOR` for backward-compatible features.
- Increment `PATCH` for backward-compatible fixes.
- If the services in {{SERVICES_AND_PORTS}} deploy independently, version each one separately rather than sharing a single repo-wide version number — a breaking change in one service's API shouldn't force a version bump in another.

## Pre-release and Build Metadata
- Use prerelease identifiers for non-final versions when needed:
	- `1.4.0-alpha.1`
	- `1.4.0-rc.1`
- Use build metadata only for build traceability, for example: `1.4.0+build.20260731`.

## Release Process Rules
- Create release tags only after approval.
- Ensure release notes summarize user-visible changes and any breaking behavior — call out explicitly if a change affects `{{CONTESTED_ENTITY}}`'s state contract, since the frontend and the owning service must stay in sync on this.
- Verify tests and critical validation steps pass before publishing a release.
