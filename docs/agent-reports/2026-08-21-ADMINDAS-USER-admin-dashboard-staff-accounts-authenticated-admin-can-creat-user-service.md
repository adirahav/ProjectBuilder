No stray `docs/` folders. My changes are confined to `backend/user-service/**` (the other modified files belong to the parallel api-gateway/frontend agents).

## Summary

Implemented `POST /api/auth/register` in `user-service` per PRD F12 / Screen 8 (AC-10), extending plan 011's existing auth module rather than adding a new one.

**Three items worth your attention:**

1. **Port discrepancy** — my launch input said port **4003**, but `user-service` is **4002** (`api/lib/config.ts`, `.env.example`); 4003 is `notification-service`. I kept 4002 and changed nothing.
2. **Missing contract file** — `docs/api-contract/api-contract.user-service.yaml` does not exist. I implemented against the `RegisterRequest`/`RegisterResponse` schemas and the `/api/auth/register` operation in `api-contract.api-gateway.yaml`, which spec the route fully (field constraints, all status codes).
3. **`Admin.name` is now `required`** — it didn't exist before. I updated `seedAdmin.ts` to supply one (optional `ADMIN_NAME`, defaults to `"Administrator"`) so seeded accounts stay valid; any Admin doc predating this change would fail validation on a future `.save()`.

**Security posture:** the route deliberately does no JWT check of its own — the gateway gates it, per the established trust boundary. I left explicit read-before-editing comments at the route mount and in the controller, and tests assert no `/signup` or public `/register` alias exists. Validation rejects non-string fields before any query (NoSQL-injection guard), the password ceiling is checked in *bytes* (bcrypt's real truncation point), only the three named fields are ever inserted (no body spread), and 409 is raised both by the up-front check and by catching duplicate-key `11000` so a concurrent race can't 500.

=== BACKEND AGENT REPORT ===
```
Ticket: ADMINDAS-USER
Service: user-service
Date: 2026-08-21

Endpoints implemented:
  POST /api/auth/register  ✓  201 / 400 / 409 / 500 (PRD F12, Screen 8, AC-10)
  POST /api/auth/login     ✓  unchanged, still public (regression-covered)
  GET  /health             ✓  unchanged
  GET  /health/ready       ✓  unchanged

Data models: Admin (added required `name`; uuid, name, email, passwordHash, createdAt)

Files changed (all under backend/user-service/):
  api/models/admin.model.ts      — `name` field
  api/auth/auth.service.ts       — createAdmin(), EmailTakenError, validation
  api/auth/auth.controller.ts    — registerAdmin() status mapping
  api/auth/auth.routes.ts        — POST /register mount + security comment
  api/scripts/seedAdmin.ts       — supplies `name` (ADMIN_NAME, default "Administrator")
  .env.example                   — documents ADMIN_NAME
  api/auth/auth.register.test.ts — new, 35 tests
  api/app.ts                     — no change needed (router already mounted)

Unit tests: 75 passed, 0 failed (40 pre-existing + 35 new)
TypeScript: tsc --noEmit clean

Flagged for orchestrator:
  - Launch input said port 4003; user-service is 4002 (4003 = notification-service)
  - docs/api-contract/api-contract.user-service.yaml does not exist; implemented
    against the F12 spec in api-contract.api-gateway.yaml
  - Admin.name is now required — api-gateway must not be the only thing standing
    between this route and the internet (it does no JWT check of its own)

To run:
cd backend/user-service && npm run dev   # port 4002
```

STATUS: DONE