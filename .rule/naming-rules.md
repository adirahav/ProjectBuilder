# Naming Rules

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `tour.service.ts`, `seat.slice.ts`, `bus.types.ts`.
- Use consistent domain terms across the codebase — see `.doc/glossary.md` for the full list.
  - `tour` — a scheduled trip. Never `trip`, `event`, `journey`.
  - `bus` — a vehicle belonging to a tour. Never `vehicle`, `coach`.
  - `busType` — a reusable seat-grid template. Never `busTemplate`, `seatTemplate`, `layoutTemplate`.
  - `seat` — a single seat position, carrying passenger identity when occupied/requested. Never `booking`/`reservation` as the entity name (only as informal descriptions of the same operation).
  - `seatStatus` — one of `available` / `pending` / `taken` / `reserved`. Never alternate casing or synonyms.
  - `admin` — the only entity with login credentials. Never `manager`, `organizer`.
  - `pickupPoint` — a named stop on a bus. Never `stop`, `station`.
  - Always use `admin` in code/API for the authenticated role, with `roles` array values `admin` | `user`.
  - `passenger` — the unauthenticated actor; always this term, never modeled as its own entity/collection, and never called `user` (that term is reserved for the `role: user` admin-entity permission level).
  - Always use the exact action verbs `request`, `approve`, `cancel`, `toggle-reserve`, `manual-assign`, `swap-move` for the corresponding seat operations — not ad-hoc synonyms.

## Route Naming

### Frontend routes
- Use kebab-case for multi-word route paths.
  - Examples: `/forgot-password`, `/tours/:id`.
- Single-word routes are plain lowercase: `/login`, `/signup`, `/home`.
- Use `/` for resource grouping/nesting: `/tours/:id`, `/buses/new`.

### Backend API routes
- Follow one convention consistently: `/api/<domain>` for the collection, `/api/<domain>/:id` for a single resource, and kebab-case for multi-word action segments.
  - Examples: `/api/auth/login`, `/api/buses/:busId/seats`, `/api/seats/toggle-reserve`, `/api/seats/manual-assign`, `/api/seats/swap-move`.
- Nest sub-resources under their parent.
- Keep a single canonical path prefix per domain — audit for any route that breaks the convention (e.g. an odd abbreviation used only once) and correct it unless there's a specific reason for the exception. Note: `seats/bookings` is a deliberate historical exception for the seat-request route (see glossary's `request` action) — do not rename the route group, but never use `booking` as the entity name.

## File Naming

### Frontend
- Pages: `<Name>Page.tsx`.
- Components: plain PascalCase, no suffix, grouped by feature folder.
- Services: `<domain>.service.ts` — one per entity (`tour`, `bus`, `busType`, `seat`, `admin`).
- State slices: `<domain>.slice.ts`.
- Utils: `<name>.utils.ts`.
- Hooks: `use<Name>.ts`.
- Router guards: `<Name>Route.tsx` (e.g. `ProtectedRoute.tsx`).
- Layouts: `<Name>Layout.tsx`.
- Types: `<domain>.types.ts`.

### Backend (per service)
- Follow the `<domain>.controller.ts` / `<domain>.service.ts` / `<domain>.routes.ts` / `<domain>.middleware.ts` pattern per domain folder.
- Domain folder names are singular and match the glossary term (`tour`, `bus`, `busType`, `seat`, `admin`).

## Data Fields
- Identity: every entity's client-facing identifier is `id` (a `uuid` string). Mongo's `_id` (ObjectId) is an internal detail — see `.rule/database-rules.md` "External Identity" and the `mongoose-models-layer` skill — and must never appear in an API response, a frontend type, or a URL param name. Frontend types/interfaces always declare `id: string`, never `_id`.
- Use camelCase for all TypeScript interface/type fields, state fields, and MongoDB document fields.
- Use the exact `seat` status values (`available`, `pending`, `taken`, `reserved`) everywhere — UI, API payloads, and DB — no alternate casing or synonyms.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `.doc/glossary.md`.
- Avoid introducing synonyms for existing concepts — consult `.doc/glossary.md` first.
