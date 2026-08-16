# Testing Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{SERVICES_AND_PORTS}}, {{ENTITIES}}, {{CONTESTED_ENTITY}}, {{TEST_FRAMEWORK_FRONTEND}}, {{TEST_FRAMEWORK_BACKEND}}
Ask the user: "What's the highest-risk/most concurrency-sensitive domain area needing deepest test coverage (if any)?" "What test framework(s) will you use per side?"
Delete this comment block once filled.
-->

## Purpose
- Define consistent expectations for test coverage, test design, and release confidence across this repo (frontend + backend service(s)).

## Current State
- Note here whether a test framework is already installed, or whether these rules define the target conventions to adopt once testing is introduced.
  - Recommended stack, frontend (Vite + React): {{TEST_FRAMEWORK_FRONTEND}} (e.g. Vitest + React Testing Library) for unit/component tests.
  - Recommended stack, backend (Node/Express, per service): {{TEST_FRAMEWORK_BACKEND}} for unit/integration tests, with an in-memory or test-database instance (never point tests at the real production cluster).

## Scope
- Apply these rules to unit, component, and integration tests across `frontend/` and each backend service in {{SERVICES_AND_PORTS}}.
- End-to-end tests, where added, should cover the critical cross-service user flows for this product.

## Core Principles
- Test behavior, not implementation details.
- Keep tests deterministic and isolated.
- Prefer fast feedback: unit tests first, integration tests for cross-domain logic, end-to-end for critical user flows.
- Add tests for every bug fix when feasible.
- If a contested entity (`{{CONTESTED_ENTITY}}`) exists, its status-transition logic is the highest-risk area in this codebase (concurrency, admin overrides) — it should have the deepest coverage of any single domain.

## Required Coverage Areas

### Frontend (`frontend/src/`)
- All service-layer modules in `services/` — one per entity in {{ENTITIES}} — domain logic, formatting, and edge cases.
- All calls that go through `http.service.ts` — mock it rather than hitting a real API; cover success, error, loading, and any conflict states for each consuming service.
- Auth session boundary behavior (e.g. 401 handling and redirect in `http.service.ts`).
- State slices in `store/` — state transitions, especially any contested entity's status transitions.
- Custom hooks in `hooks/`.
- Form validation logic.
- User-facing failure flows: an action on `{{CONTESTED_ENTITY}}` that's no longer valid; two actors racing the same action.

### Backend (per service in {{SERVICES_AND_PORTS}})
- Auth controller/service logic: login, signup, logout, forgot-password — valid credentials, invalid credentials, expired/malformed tokens.
- JWT issuance and validation middleware.
- CRUD logic per entity — including delete cascading behavior and validation on create/update.
- If `{{CONTESTED_ENTITY}}` exists, its lifecycle logic is the most important test target in the repo:
  - Every valid transition succeeds; every invalid transition is rejected.
  - **Concurrency case:** two simultaneous requests for the same resource — exactly one should succeed; the other should get a clear conflict response. Test this with a true concurrent/atomic-update scenario, not just sequential calls.
- Admin-only middleware on protected write/management routes.

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
