# Naming Rules

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `<entity>.service.ts`, `<entity>.slice.ts`, `<entity>.types.ts`.
- Use consistent domain terms across the codebase — see `.doc/glossary.md` for the full list.
  - `Service` — a grooming treatment offered by the clinic (name, `durationMinutes`, `price`). Never `Treatment`, `Product`, or `Offering`.
  - `TimeSlot` — a single bookable unit of time (the contested resource). Never `Slot` alone, `Seat`, or `Availability`.
  - `Appointment` — a customer's booking of one `Service` at one `TimeSlot`. Never `Booking`, `Reservation`, or `Order`.
  - Always use `Admin` in code/API for the authenticated role (the clinic owner).
  - `Customer` (unauthenticated) — always use this term, never `Guest`, `User`, or `Client`. A `Customer` has no authenticated account; it is identified only by name + phone captured on the `Appointment` at booking time. `User` is reserved for internal/generic auth-account language in `user-service` and must never mean `Customer`.
  - Always use the exact action verbs `book`, `hold`, `confirm`, `cancel`, `complete` for the corresponding operations — not ad-hoc synonyms like reserve/approve/reject/delete/schedule.

## Route Naming

### Frontend routes
- Use kebab-case for multi-word route paths.
  - Examples: `/book/:serviceId`, `/appointments/:id`.
- Single-word routes are plain lowercase: `/login`, `/services`, `/home`.
- Use `/` for resource grouping/nesting: `/appointments/:id`, `/services/new`.

### Backend API routes
- Follow one convention consistently: `/api/<domain>` for the collection, `/api/<domain>/:id` for a single resource, and kebab-case for multi-word action segments.
  - Examples: `/api/auth/login`, `/api/appointments/:id/confirm`, `/api/services/:id/deactivate`.
- Nest sub-resources under their parent (e.g. `/api/timeslots?serviceId=&date=`).
- Keep a single canonical path prefix per domain — audit for any route that breaks the convention (e.g. an odd abbreviation used only once) and correct it unless there's a specific reason for the exception.

## File Naming

### Frontend
- Pages: `<Name>Page.tsx`.
- Components: plain PascalCase, no suffix, grouped by feature folder.
- Services: `<domain>.service.ts` — one per entity (`service.service.ts`, `appointment.service.ts`, `timeslot.service.ts`, `auth.service.ts`).
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
- `TimeSlot` is the contested entity — use its exact `status` values (`available` | `held` | `booked`) everywhere — UI, API payloads, and DB — no alternate casing or synonyms. `Appointment.status` values (`pending` | `confirmed` | `cancelled` | `completed`) follow the same rule.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `.doc/glossary.md`.
- Avoid introducing synonyms for existing concepts — consult `.doc/glossary.md` first.
