# Testing Rules

## Purpose
- Define consistent expectations for test coverage, test design, and release confidence across this repo (frontend + `gateway`/`appointment-service`/`user-service`).

## Current State
- No test framework is installed yet — these rules define the target conventions to adopt as testing is introduced alongside features.
  - Recommended stack, frontend (Vite + React): Vitest + React Testing Library for unit/component tests.
  - Recommended stack, backend (Node/Express, per service): Vitest (or Jest) for unit/integration tests, with an in-memory MongoDB instance (`mongodb-memory-server`) or a dedicated test database — never point tests at the real production cluster.

## Scope
- Apply these rules to unit, component, and integration tests across `frontend/` and each backend service (`gateway` :5000, `appointment-service` :5001, `user-service` :5002).
- End-to-end tests, where added, should cover the critical cross-service user flows: guest booking (service pick → slot pick → contact details → confirmation) and admin login → confirm/cancel appointment.

## Core Principles
- Test behavior, not implementation details.
- Keep tests deterministic and isolated.
- Prefer fast feedback: unit tests first, integration tests for cross-domain logic, end-to-end for critical user flows.
- Add tests for every bug fix when feasible.
- `TimeSlot`'s status-transition logic is the highest-risk area in this codebase (concurrency, hold-expiry, admin cancellation) — it should have the deepest coverage of any single domain.

## Required Coverage Areas

### Frontend (`frontend/src/`)
- All service-layer modules in `services/` — `service.service.ts`, `appointment.service.ts`, `timeslot.service.ts`, `auth.service.ts` — domain logic, formatting, and edge cases.
- All calls that go through `http.service.ts` — mock it rather than hitting a real API; cover success, error, loading, and conflict states for each consuming service.
- Auth session boundary behavior (e.g. 401 handling and redirect in `http.service.ts`, admin-only).
- State slices in `state/` — state transitions, especially the `TimeSlot` slice's status transitions.
- Custom hooks in `hooks/`.
- Form validation logic (booking contact-details form, service create/edit form).
- User-facing failure flows: booking a `TimeSlot` that's no longer `available`; two customers racing to book the same slot.

### Backend (per service: `gateway`, `appointment-service`, `user-service`)
- Auth controller/service logic (`user-service`): login — valid credentials, invalid credentials, expired/malformed tokens. (No signup/forgot-password in v1 — `Admin` accounts are seeded/provisioned manually.)
- JWT issuance (`user-service`) and verification middleware (`gateway`); confirm `x-user-id`/`x-user-role` headers are attached correctly and that `appointment-service`/`user-service` trust them without re-verifying.
- CRUD logic per entity (`Service`, `Appointment`) — including soft-delete/deactivate behavior and validation on create/update.
- `TimeSlot`'s lifecycle logic is the most important test target in the repo:
  - Every valid transition succeeds (`available→held`, `held→booked`, `held→available`, `booked→available`); every invalid transition is rejected (e.g. `booked→held` directly).
  - **Concurrency case:** two simultaneous booking requests for the same `TimeSlot` — exactly one should succeed with a created `Appointment`; the other should get a clear `409` conflict response. Test this with a true concurrent/atomic-update scenario (parallel requests against the same document), not just sequential calls.
- Admin-only middleware on protected write/management routes (service management, appointment confirm/cancel).

## Test Structure Rules
- Arrange tests with clear setup, action, and assertion phases.
- Use descriptive test names that state expected behavior.
- Keep one primary assertion intent per test.
- Avoid shared mutable state between tests.

## Data and Fixtures
- Use minimal fixtures focused on the scenario (e.g. one `Service`, one `TimeSlot` in `available` status).
- Prefer factories/builders over large static fixtures.
- Do not embed real secrets, keys, or credentials in test data. Use fake customer names/phone numbers, never real PII.

## Reliability Rules
- No flaky tests in mainline branches.
- Mock the external API on the frontend; use a test/in-memory database on the backend — never hit the real production database or a real deployed service from tests.
- Freeze/override time when behavior depends on it (e.g. `TimeSlot.startsAt` comparisons, hold-expiry timers).
- Do not rely on test execution order — this matters especially for `TimeSlot` concurrency tests, which must not leak state between cases.

## Pull Request Expectations
- New features include happy-path and failure-path tests.
- Bug fixes include a regression test that fails before and passes after the fix.
- Any change to `TimeSlot`'s state transitions requires an accompanying test update — this is the one area where "I'll add tests later" is not acceptable given the concurrency risk.
- Update or remove obsolete tests when behavior changes intentionally.
