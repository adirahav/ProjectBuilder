# Coding Rules

## Purpose
- Define core coding rules for JavaScript and TypeScript in this repository.
- Project: `BookMe` — a monorepo with a React/Vite frontend and a Node.js/Express backend (`booking-service`:4001, `admin-service`:4002).

## Required
- Do not use trailing semicolons in JavaScript or TypeScript files.
- If a semicolon is required for syntax safety, place it at the beginning of the line.

## Examples
- Preferred:
	- `const value = getValue()`
- Allowed when needed for syntax safety:
	- `;(() => init())()`

## Architecture
- This is a monorepo with independently deployable parts: `frontend/` and `backend/`.
- `backend/` contains `booking-service` (port 4001) and `admin-service` (port 4002) — each its own Node.js/Express process with its own `package.json`.
- The frontend never calls a database directly; it only talks to the backend service(s) over HTTPS.

### Frontend
- All communication with the backend goes through its REST API(s) — there is no direct DB access from the frontend.
- All API calls and business logic must be encapsulated in a service file in `src/services/` (one per domain entity: `service.service.ts`, `appointment.service.ts`, `timeSlot.service.ts`, `auth.service.ts`).
- Components must not call the API directly — always go through a service.
- All HTTP requests go through `src/services/http.service.ts`, which centralizes error handling and 401/session-expiry logic. Domain services call `http.service.ts`, not `fetch`/`axios` directly.
- Service files must follow the pattern: `<domain>.service.ts`.

### Backend (per service)
- Each service organizes its domains under `api/<domain>/`, following the pattern:
  `<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.routes.ts`, `<domain>.middleware.ts`.
  - `booking-service` domains: `service/`, `timeSlot/`, `appointment/`.
  - `admin-service` domains: `auth/` (login, JWT issuance), `dashboard/` (calls `booking-service`'s admin-scoped API).
- Controllers handle request/response only — no business logic in controllers; business logic lives in the domain's `.service.ts`.
- Routes files only wire up `<method> + path → controller` — no logic in routes files.
- Middleware files hold auth/validation checks scoped to that domain.
- Cross-domain logic within the same service should be called through the other domain's `.service.ts`, not by reaching into its DB models directly.

## State Management

### Frontend (React + Zustand)
- Global state is managed exclusively via Zustand, using a sliced/module pattern in `src/store/` (one slice per feature).
- Local UI state (e.g. open/close, hover, drag-in-progress) may use `useState` — do not push it into the store.
- Services update the store directly after receiving an API response — components must not duplicate that state update after calling a service.
- Loading / error state for a given flow should live in the relevant slice when shared across components, or in local `useState` when scoped to a single component (see `.rule/error-handling-rules.md` for the async-call pattern).
- `TimeSlot` is a contested/high-contention entity: since its status can change from multiple directions at once (another customer booking it, a hold expiring, an admin cancelling/rescheduling), keep its live state in a dedicated `timeSlot.slice.ts` as the single source of truth rather than deriving it locally in a component.
