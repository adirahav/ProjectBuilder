# Testing Rules

## Purpose
- Define consistent expectations for test coverage, test design, and release confidence across this repo (frontend + backend services).

## Current State
- No test framework is installed yet as of setup time; these rules define the target conventions to adopt as testing is introduced.
  - Frontend (Vite + React): Vitest + React Testing Library for unit/component tests.
  - Backend (Node/Express, per service): Jest + Supertest for unit/integration tests, with an in-memory MongoDB instance (`mongodb-memory-server`) or a dedicated test database — never point tests at the real production cluster.

## Scope
- Apply these rules to unit, component, and integration tests across `frontend/` and each backend service: `api-gateway`, `appointment-service`, `catalog-service`, `user-management-service`.
- End-to-end tests, where added, should cover the critical cross-service user flows: guest booking flow, admin login + approve/cancel flow.

## Core Principles
- Test behavior, not implementation details.
- Keep tests deterministic and isolated.
- Prefer fast feedback: unit tests first, integration tests for cross-domain logic, end-to-end for critical user flows.
- Add tests for every bug fix when feasible.
- `TimeSlot`'s status-transition logic is the highest-risk area in this codebase (concurrency between simultaneous customer bookings, plus admin blocks/unblocks) — it should have the deepest coverage of any single domain.

## Required Coverage Areas

### Frontend (`frontend/src/`)
- All service-layer modules in `services/` — `service.service.ts`, `appointment.service.ts`, `timeSlot.service.ts`, `auth.service.ts` — domain logic, formatting, and edge cases.
- All calls that go through `http.service.ts` — mock it rather than hitting a real API; cover success, error, loading, and conflict states for each consuming service.
- Auth session boundary behavior (e.g. 401 handling and redirect in `http.service.ts`).
- State slices in `store/` — state transitions, especially `TimeSlot`'s status transitions.
- Custom hooks in `hooks/`.
- Form validation logic (booking details form, service create/edit form).
- User-facing failure flows: booking a `TimeSlot` that's no longer `available`; two customers racing the same slot.

### Backend (per service)
- `user-management-service`: login logic — valid credentials, invalid credentials, expired/malformed tokens.
- `api-gateway`: JWT verification middleware and internal-header (`x-user-id`/`x-user-role`) injection; proxy routing to each downstream service.
- CRUD logic per entity (`Service` in `catalog-service`; `Appointment`/`TimeSlot` in `appointment-service`) — including soft-delete behavior for `Service` and validation on create/update.
- `TimeSlot`'s lifecycle logic is the most important test target in the repo:
  - Every valid transition succeeds; every invalid transition is rejected.
  - **Concurrency case:** two simultaneous `POST /api/appointments` requests for the same `TimeSlot` — exactly one should succeed; the other should get a clear `409 Conflict` response. Test this with a true concurrent/atomic-update scenario, not just sequential calls.
- Admin-only middleware on protected write/management routes (service management, appointment approve/cancel, time-slot block/unblock).

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
- Mock the external API on the frontend; use a test/in-memory database on the backend — never hit the real production database or a real deployed service from tests.
- Freeze/override time when behavior depends on it.
- Do not rely on test execution order — this matters especially for any contested-entity tests, which must not leak state between cases.

## Pull Request Expectations
- New features include happy-path and failure-path tests.
- Bug fixes include a regression test that fails before and passes after the fix.
- Any change to `TimeSlot`'s state transitions requires an accompanying test update — this is the one area where "I'll add tests later" is not acceptable given the concurrency risk.
- Update or remove obsolete tests when behavior changes intentionally.
