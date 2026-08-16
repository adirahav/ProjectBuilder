# Naming Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{ENTITIES}} — canonical domain terms, one line each with synonyms to avoid
  {{ACTION_VERBS}} — canonical action-verb names for key operations (avoid synonyms)
  {{ROLE_NAME}} — the authenticated role's canonical term (e.g. "admin")
  {{UNAUTHENTICATED_ROLE}} — the unauthenticated actor's canonical term, if any (e.g. "guest"/"passenger")
  {{CONTESTED_ENTITY}}, {{STATUS_VALUES}} — if a contested entity exists
  {{GLOSSARY_FILE}} — path to the project glossary, e.g. .doc/glossary.md
Ask the user: "List your canonical domain terms and synonyms to explicitly avoid." "What are the canonical action-verb names for key state-transition operations?"
Delete this comment block once filled.
-->

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `<entity>.service.ts`, `<entity>.slice.ts`, `<entity>.types.ts`.
- Use consistent domain terms across the codebase — see `{{GLOSSARY_FILE}}` for the full list.
  - {{ENTITIES}} — one canonical term per line, with the synonym(s) to avoid noted next to it.
  - Always use `{{ROLE_NAME}}` in code/API for the authenticated role.
  - {{UNAUTHENTICATED_ROLE}} (if applicable) — always use this term, not a synonym; note explicitly that this actor has no authenticated account.
  - Always use the exact action verbs {{ACTION_VERBS}} for the corresponding operations — not ad-hoc synonyms.

## Route Naming

### Frontend routes
- Use kebab-case for multi-word route paths.
  - Examples: `/forgot-password`, `/<entity>/:id`.
- Single-word routes are plain lowercase: `/login`, `/signup`, `/home`.
- Use `/` for resource grouping/nesting: `/<entity>/:id`, `/<entity>/new`.

### Backend API routes
- Follow one convention consistently: `/api/<domain>` for the collection, `/api/<domain>/:id` for a single resource, and kebab-case for multi-word action segments.
  - Examples: `/api/auth/forgot-password`, `/api/<entity>/:id/<sub-entity>/toggle-reserve`.
- Nest sub-resources under their parent.
- Keep a single canonical path prefix per domain — audit for any route that breaks the convention (e.g. an odd abbreviation used only once) and correct it unless there's a specific reason for the exception.

## File Naming

### Frontend
- Pages: `<Name>Page.tsx`.
- Components: plain PascalCase, no suffix, grouped by feature folder.
- Services: `<domain>.service.ts` — one per entity in {{ENTITIES}}.
- State slices: `<domain>.slice.ts`.
- Utils: `<name>.utils.ts`.
- Hooks: `use<Name>.ts`.
- Router guards: `<Name>Route.tsx` (e.g. `ProtectedRoute.tsx`).
- Layouts: `<Name>Layout.tsx`.
- Types: `<domain>.types.ts`.

### Backend (per service)
- Follow the `<domain>.controller.ts` / `<domain>.service.ts` / `<domain>.routes.ts` / `<domain>.middleware.ts` pattern per domain folder.
- Domain folder names are singular and match the glossary term.

## Data Fields
- Identity: every entity's client-facing identifier is `id` (a `uuid` string). Mongo's `_id` (ObjectId) is an internal detail — see `.rule/database-rules.md` "External Identity" and the `mongoose-models-layer` skill — and must never appear in an API response, a frontend type, or a URL param name. Frontend types/interfaces always declare `id: string`, never `_id`.
- Use camelCase for all TypeScript interface/type fields, state fields, and MongoDB document fields.
- If a contested entity exists, use the exact `{{CONTESTED_ENTITY}}` status values ({{STATUS_VALUES}}) everywhere — UI, API payloads, and DB — no alternate casing or synonyms.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `{{GLOSSARY_FILE}}`.
- Avoid introducing synonyms for existing concepts — consult `{{GLOSSARY_FILE}}` first.
