# Naming Rules

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `service.service.ts`, `appointment.slice.ts`, `timeSlot.types.ts`.
- Use consistent domain terms across the codebase — see `.doc/glossary.md` for the full list.
  - `Service` — never `Treatment`, `Offering`, or `Item`. (Note: this is the domain entity, distinct from the microservices `booking-service`/`admin-service` — always spell out the full hyphenated service name when referring to a microservice.)
  - `Appointment` — never `Booking`, `Order`, or `Reservation`.
  - `TimeSlot` — never `Slot` alone, `Window`, or `Timeslot`.
  - Always use `admin` in code/API for the authenticated role.
  - `Customer` — always use this term, not `User` or `Client`; note explicitly this actor has no authenticated account.
  - Always use the exact action verbs `book`, `approve`, `cancel`, `reschedule` for the corresponding operations — not ad-hoc synonyms.

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
- The contested entity `TimeSlot` uses the exact status values `available`, `held`, `booked` everywhere — UI, API payloads, and DB — no alternate casing or synonyms. `Appointment` uses `pending`, `confirmed`, `completed`, `cancelled` the same way.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `.doc/glossary.md`.
- Avoid introducing synonyms for existing concepts — consult `.doc/glossary.md` first.
