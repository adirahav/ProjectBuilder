# Coding Rules

## Purpose
- Define core coding rules for JavaScript and TypeScript in this repository.
- Project: `ClinicBook` — a monorepo with a React/Vite frontend and a Node.js/Express microservices backend: `api-gateway` (4000), `appointment-service` (4001), `catalog-service` (4002), `user-management-service` (4003).

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
- `backend/` contains four services — `api-gateway`, `appointment-service`, `catalog-service`, `user-management-service` — each its own Node.js/Express process with its own `package.json`.
- The frontend never calls a database directly; it only talks to `api-gateway` over HTTPS. It never calls `appointment-service`, `catalog-service`, or `user-management-service` directly — they are not internet-reachable in production.

### Frontend
- All communication with the backend goes through `api-gateway`'s REST API — there is no direct DB access from the frontend, and no direct calls to any downstream service.
- All API calls and business logic must be encapsulated in a service file in `src/services/` (one per domain entity: `service.service.ts`, `appointment.service.ts`, `timeSlot.service.ts`, `auth.service.ts`).
- Components must not call the API directly — always go through a service.
- All HTTP requests go through `src/services/http.service.ts`, which centralizes error handling and 401/session-expiry logic. Domain services call `http.service.ts`, not `fetch`/`axios` directly.
- Service files must follow the pattern: `<domain>.service.ts`.

### Backend (per service)
- Each service organizes its domains under `api/<domain>/`, following the pattern:
  `<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.routes.ts`, `<domain>.middleware.ts`.
  - `catalog-service` domains: `service/`.
  - `appointment-service` domains: `appointment/`, `timeSlot/`.
  - `user-management-service` domains: `auth/`.
  - `api-gateway` has no domain models — it holds `proxy/` (per-downstream-service proxy routing) and `middleware/` (JWT verification, internal-header injection).
- Controllers handle request/response only — no business logic in controllers; business logic lives in the domain's `.service.ts`.
- Routes files only wire up `<method> + path → controller` — no logic in routes files.
- Middleware files hold auth/validation checks scoped to that domain.
- Cross-domain logic within the same service should be called through the other domain's `.service.ts`, not by reaching into its DB models directly (e.g. `appointment.service.ts` calls `timeSlot.service.ts`, never `TimeSlot` model directly).

## State Management

### Frontend (React + Zustand)
- Global state is managed exclusively via Zustand, using a sliced/module pattern in `src/store/` (one slice per feature: `service.slice.ts`, `appointment.slice.ts`, `timeSlot.slice.ts`, `auth.slice.ts`).
- Local UI state (e.g. open/close, hover, drag-in-progress) may use `useState` — do not push it into the store.
- Services update the store directly after receiving an API response — components must not duplicate that state update after calling a service.
- Loading / error state for a given flow should live in the relevant slice when shared across components, or in local `useState` when scoped to a single component (see `.rule/error-handling-rules.md` for the async-call pattern).
- `TimeSlot` is a special case: since its status can change from multiple directions at once (two customers, or an admin block), keep its live state in a dedicated slice (`timeSlot.slice.ts`) as the single source of truth rather than deriving it locally in a component.
