# Coding Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{PROJECT_NAME}}, {{SERVICES_AND_PORTS}}, {{ENTITIES}}, {{FRONTEND_STATE_LIB}} (e.g. Zustand/Redux/Context)
  {{CONTESTED_ENTITY}} — if applicable, the entity needing single-source-of-truth state treatment
Ask the user: "How many backend services, and what are their domain names?" "What global state library do you use?"
Delete this comment block once filled.
-->

## Purpose
- Define core coding rules for JavaScript and TypeScript in this repository.
- Project: `{{PROJECT_NAME}}` — a monorepo with a React/Vite frontend and a Node.js/Express backend ({{SERVICES_AND_PORTS}}).

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
- `backend/` contains the service(s) listed in {{SERVICES_AND_PORTS}} — each its own Node.js/Express process with its own `package.json`.
- The frontend never calls a database directly; it only talks to the backend service(s) over HTTPS.

### Frontend
- All communication with the backend goes through its REST API(s) — there is no direct DB access from the frontend.
- All API calls and business logic must be encapsulated in a service file in `src/services/` (one per domain entity in {{ENTITIES}}).
- Components must not call the API directly — always go through a service.
- All HTTP requests go through `src/services/http.service.ts`, which centralizes error handling and 401/session-expiry logic. Domain services call `http.service.ts`, not `fetch`/`axios` directly.
- Service files must follow the pattern: `<domain>.service.ts`.

### Backend (per service)
- Each service organizes its domains under `api/<domain>/`, following the pattern:
  `<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.routes.ts`, `<domain>.middleware.ts`.
  - List each service's domains here once decided, e.g. `<service>` domains: `<domain-a>/`, `<domain-b>/`.
- Controllers handle request/response only — no business logic in controllers; business logic lives in the domain's `.service.ts`.
- Routes files only wire up `<method> + path → controller` — no logic in routes files.
- Middleware files hold auth/validation checks scoped to that domain.
- Cross-domain logic within the same service should be called through the other domain's `.service.ts`, not by reaching into its DB models directly.

## State Management

### Frontend (React + {{FRONTEND_STATE_LIB}})
- Global state is managed exclusively via {{FRONTEND_STATE_LIB}}, using a sliced/module pattern in `src/store/` (one slice per feature).
- Local UI state (e.g. open/close, hover, drag-in-progress) may use `useState` — do not push it into the store.
- Services update the store directly after receiving an API response — components must not duplicate that state update after calling a service.
- Loading / error state for a given flow should live in the relevant slice when shared across components, or in local `useState` when scoped to a single component (see `.rule/error-handling-rules.md` for the async-call pattern).
- Any contested/high-contention entity (`{{CONTESTED_ENTITY}}`, if applicable) is a special case: since its status can change from multiple directions at once, keep its live state in a dedicated slice as the single source of truth rather than deriving it locally in a component.
