# Naming Rules

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `<entity>.service.ts`, `<entity>.slice.ts`, `<entity>.types.ts`.
- Use consistent domain terms across the codebase — see `.doc/glossary.md` for the full list.
  - `Service` — a treatment the clinic offers (name, duration, price). Never `Treatment`, `Offering`, `Product`. (Note: bare "service" in a microservice/architecture context means `booking-service`/`user-service`/`notification-service`; the domain entity is always capitalized or written "a Service record".)
  - `Appointment` — a customer's booking of a `Service` at a `TimeSlot`. Never `Booking`, `Reservation`, `Order`.
  - `TimeSlot` — a bookable date/time window for a `Service`; the contested entity. Never `Slot`, `Time Slot`, `Availability`.
  - Always use `Admin` in code/API for the authenticated role.
  - `Customer` — the unauthenticated actor who books an `Appointment`. Always use this term, never `User`; this actor has no account and never logs in.
  - Always use the exact action verbs `book`, `confirm`, `cancel` for the corresponding operations — not `reserve`/`order`/`approve`/`delete`/`remove`.

## Route Naming

### Frontend routes
- Use kebab-case for multi-word route paths.
  - Examples: `/time-slots`, `/services/:id`.
- Single-word routes are plain lowercase: `/login`, `/services`, `/home`.
- Use `/` for resource grouping/nesting: `/services/:id`, `/appointments/new`.

### Backend API routes
- Follow one convention consistently: `/api/<domain>` for the collection, `/api/<domain>/:id` for a single resource, and kebab-case for multi-word action segments.
  - Examples: `/api/auth/login`, `/api/time-slots/:id/hold`, `/api/appointments/:id/confirm`.
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
- Use the exact `TimeSlot` status values (`open`, `held`, `booked`) and `Appointment` status values (`pending`, `confirmed`, `cancelled`) everywhere — UI, API payloads, and DB — no alternate casing or synonyms.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `.doc/glossary.md`.
- Avoid introducing synonyms for existing concepts — consult `.doc/glossary.md` first.
