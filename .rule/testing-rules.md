# Testing Rules

## Purpose
- Define consistent expectations for test coverage, test design, and release confidence across this repo (frontend + `tour-service` + `user-management-service`).

## Current State
- No test framework is installed yet — these rules define the target conventions to adopt once testing is introduced.
  - Recommended stack, frontend (Vite + React): Vitest + React Testing Library for unit/component tests.
  - Recommended stack, backend (Node/Express, per service): Vitest (or Jest) for unit/integration tests, with an in-memory MongoDB instance (e.g. `mongodb-memory-server`) or a dedicated test database — never point tests at the real `mongodb://localhost:27017/hila-tours` development/production data.

## Scope
- Apply these rules to unit, component, and integration tests across `frontend/` and each backend service (`tour-service`, `user-management-service`).
- End-to-end tests, where added, should cover the critical cross-service user flows: admin login → seat approve; passenger seat request → conflict handling.

## Core Principles
- Test behavior, not implementation details.
- Keep tests deterministic and isolated.
- Prefer fast feedback: unit tests first, integration tests for cross-domain logic, end-to-end for critical user flows.
- Add tests for every bug fix when feasible.
- `seat`'s status-transition logic is the highest-risk area in this codebase (concurrency, admin overrides) — it should have the deepest coverage of any single domain.

## Required Coverage Areas

### Frontend (`frontend/src/`)
- All service-layer modules in `services/` — one per entity (`tour`, `bus`, `busType`, `seat`, `admin`/`auth`) — domain logic, formatting, and edge cases.
- All calls that go through `http.service.ts` — mock it rather than hitting a real API; cover success, error, loading, and conflict states for each consuming service.
- Auth session boundary behavior (e.g. 401 handling and redirect in `http.service.ts`).
- State slices in `store/` — state transitions, especially `seat.slice.ts`'s status transitions.
- Custom hooks in `hooks/`.
- Form validation logic (login, signup, seat-request modal, tour/bus/busType forms).
- User-facing failure flows: a `seat` action that's no longer valid (e.g. approving an already-cancelled seat); two passengers racing to request the same seat.

### Backend (per service)

#### user-management-service
- Auth controller/service logic: login, signup, role promotion — valid credentials, invalid credentials, expired/malformed tokens.
- JWT issuance and validation middleware.
- Admin CRUD/role-update logic and validation.
- Admin-only middleware on protected write/management routes.

#### tour-service
- CRUD logic for `tour`, `bus`, `busType` — including soft-delete cascading behavior (`tour`/`bus`) and validation on create/update.
- `seat` lifecycle logic is the most important test target in the repo:
  - Every valid transition succeeds (`available`→`pending`, `pending`→`taken`, `pending`/`taken`→`available`, `available`↔`reserved`, any→`taken` via `manual-assign`, `swap-move` between two seats); every invalid transition is rejected.
  - **Concurrency case:** two simultaneous `request` calls for the same seat — exactly one should succeed; the other should get a clear 409 conflict response. Test this with a true concurrent/atomic-update scenario, not just sequential calls.
- Admin-only middleware on protected write/management routes (`approve`, `cancel`, `toggle-reserve`, `manual-assign`, `swap-move`, tour/bus/busType CRUD).

## Test Structure Rules
- Arrange tests with clear setup, action, and assertion phases.
- Use descriptive test names that state expected behavior.
- Keep one primary assertion intent per test.
- Avoid shared mutable state between tests.

## Data and Fixtures
- Use minimal fixtures focused on the scenario.
- Prefer factories/builders over large static fixtures.
- Do not embed real secrets, keys, or credentials in test data.

## Reliability Rules
- No flaky tests in mainline branches.
- Mock the external API on the frontend; use a test/in-memory database on the backend — never hit the real `hila-tours` development database or a real deployed service from tests.
- Freeze/override time when behavior depends on it (e.g. `requestedAt`, `approvedAt`).
- Do not rely on test execution order — this matters especially for `seat` tests, which must not leak state between cases.

## Pull Request Expectations
- New features include happy-path and failure-path tests.
- Bug fixes include a regression test that fails before and passes after the fix.
- Any change to `seat`'s state transitions requires an accompanying test update — this is the one area where "I'll add tests later" is not acceptable given the concurrency risk.
- Update or remove obsolete tests when behavior changes intentionally.
