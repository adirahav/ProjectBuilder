# Testing Rules

## Purpose
- Define consistent expectations for test coverage, test design, and release confidence across this repo (frontend + backend services).

## Current State
- No test framework is installed yet — these rules define the target conventions to adopt once testing is introduced.
  - Recommended stack, frontend (Vite + React): Vitest + React Testing Library for unit/component tests.
  - Recommended stack, backend (Node/Express, per service): Vitest (or Jest) for unit/integration tests, with an in-memory or test-database instance (never point tests at the real production cluster).

## Scope
- Apply these rules to unit, component, and integration tests across `frontend/` and `backend/booking-service`, `backend/admin-service`.
- End-to-end tests, where added, should cover the critical cross-service user flows for this product (customer booking flow; admin login → approve/cancel/reschedule).

## Core Principles
- Test behavior, not implementation details.
- Keep tests deterministic and isolated.
- Prefer fast feedback: unit tests first, integration tests for cross-domain logic, end-to-end for critical user flows.
- Add tests for every bug fix when feasible.
- `TimeSlot`'s status-transition logic is the highest-risk area in this codebase (concurrency between customers, admin overrides via cancel/reschedule) — it should have the deepest coverage of any single domain.

## Required Coverage Areas

### Frontend (`frontend/src/`)
- All service-layer modules in `services/` — `service.service.ts`, `appointment.service.ts`, `timeSlot.service.ts`, `auth.service.ts` — domain logic, formatting, and edge cases.
- All calls that go through `http.service.ts` — mock it rather than hitting a real API; cover success, error, loading, and any conflict states for each consuming service.
- Auth session boundary behavior (e.g. 401 handling and redirect in `http.service.ts`).
- State slices in `store/` — state transitions, especially `timeSlot.slice.ts`'s status transitions.
- Custom hooks in `hooks/`.
- Form validation logic (Booking Form: name required, phone-or-email required).
- User-facing failure flows: booking a `TimeSlot` that's no longer `available`; two actors racing the same slot.

### Backend (per service)
**`admin-service`:**
- Auth controller/service logic: login — valid credentials, invalid credentials, expired/malformed tokens.
- JWT issuance and validation middleware.
- Dashboard aggregation calls to `booking-service` — mock the HTTP call, cover success/error/timeout.

**`booking-service`:**
- CRUD logic per entity (`Service`, `Appointment`) — including soft-delete behavior and validation on create/update.
- `TimeSlot` lifecycle logic is the most important test target in the repo:
  - Every valid transition (`available→held`, `held→booked`, `held→available`, `booked→available`) succeeds; every invalid transition is rejected.
  - **Concurrency case:** two simultaneous hold/book requests for the same `TimeSlot` — exactly one should succeed; the other should get a clear `409` conflict response. Test this with a true concurrent/atomic-update scenario, not just sequential calls.
- JWT validation middleware on admin-scoped routes (approve/cancel/reschedule/manage Services).

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
- Any change to a contested entity's state transitions requires an accompanying test update — this is the one area where "I'll add tests later" is not acceptable given the concurrency risk.
- Update or remove obsolete tests when behavior changes intentionally.
