# Naming Rules

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `service.service.ts`, `appointment.slice.ts`, `timeSlot.types.ts`.
- Use consistent domain terms across the codebase — see `.doc/glossary.md` for the full list.
  - `Service` — not `Treatment`, `Product`, or `Offering`.
  - `Appointment` — not `Booking`, `Reservation`, or `Order`.
  - `TimeSlot` — not `Slot` alone, `Seat`, or `Booking Window`.
  - Always use `admin` in code/API for the authenticated role.
  - `customer` — always use this term, not `user`/`guest`/`client`; this actor has no authenticated account and never will in v1.
  - Always use the exact action verbs `book`, `approve`, `cancel` for the corresponding operations — not ad-hoc synonyms (`reserve`, `confirm`, `reject`, `delete`).

## Route Naming

### Frontend routes
- Use kebab-case for multi-word route paths.
  - Examples: `/services/:id`, `/time-slots/:id`.
- Single-word routes are plain lowercase: `/login`, `/services`, `/appointments`.
- Use `/` for resource grouping/nesting: `/appointments/:id`, `/services/new`.

### Backend API routes
- Follow one convention consistently: `/api/<domain>` for the collection, `/api/<domain>/:id` for a single resource, and kebab-case for multi-word action segments.
  - Examples: `/api/auth/login`, `/api/appointments/:id/approve`, `/api/time-slots/:id/block`.
- Nest sub-resources under their parent.
- Keep a single canonical path prefix per domain — audit for any route that breaks the convention (e.g. an odd abbreviation used only once) and correct it unless there's a specific reason for the exception.

## File Naming

### Frontend
- Pages: `<Name>Page.tsx`.
- Components: plain PascalCase, no suffix, grouped by feature folder.
- Services: `<domain>.service.ts` — one per entity (`service.service.ts`, `appointment.service.ts`, `timeSlot.service.ts`).
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
- Use the exact `TimeSlot` status values (`available`, `held`, `booked`, `blocked`) and `Appointment` status values (`pending`, `approved`, `cancelled`, `completed`) everywhere — UI, API payloads, and DB — no alternate casing or synonyms.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `.doc/glossary.md`.
- Avoid introducing synonyms for existing concepts — consult `.doc/glossary.md` first.
