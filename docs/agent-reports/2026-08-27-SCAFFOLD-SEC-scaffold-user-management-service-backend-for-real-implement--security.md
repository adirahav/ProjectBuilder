Security audit complete. Summary:

**Scope**: Audited the newly-built `backend/user-management-service` (scaffold + `POST /api/auth/signup`), the frontend signup flow, and both API contracts.

**Result**: No critical/high findings. Implementation correctly enforces the role-escalation invariant (server hardcodes `roles: ['user']`, ignores client input, verified via injection/mass-assignment tests), bcrypt password hashing, JWT `HS256`-only algorithm pinning, DB-level unique-email enforcement, CORS restriction, and PII-safe error handling. One low-severity finding (SEC-SCAFFOLD-001): oversized/malformed request bodies return `500` instead of their proper `413`/`400` — a status-code accuracy issue with no security impact (the limits themselves are enforced correctly).

**Tests written**: `docs/tests/security/scaffold-sec-signup.security.test.ts` (12 tests, all passing) plus a standalone vitest config (`vitest.security.user-management.config.ts`) since editing the service's own config was out of my write scope. Pre-existing backend suite re-verified: 25/25 passing, typecheck clean.

**Report**: `docs/agent-reports/2026-08-27-SCAFFOLD-SEC-scaffold-user-management-service-backend-for-real-implement--security.md`

STATUS: DONE