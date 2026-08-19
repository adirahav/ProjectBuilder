Done. All 40 tests pass and `tsc --noEmit` is clean.

**Note on one mid-task mistake I caught and fixed:** a `cd backend/user-service` persisted in my shell, so three files initially landed in a stray `backend/user-service/backend/user-service/...` tree. I moved them into `api/auth/` and removed the empty stray tree — verified gone via `git status`.

**Two things needing your attention:**

1. **`docs/api-contract/api-contract.user-service.yaml` does not exist.** Only the `api-gateway` and `booking-service` contracts are present. I implemented against the `api-gateway` contract's `/api/auth/login` definition, which is the authoritative shape for this route (it documents the request/response the gateway proxies straight through). Key consequence: the request field is **`identifier`** (email *or* username, per PRD Screen 5), **not `email`** — the gateway and frontend agents must match this.
2. **Seed credentials**: I asked about `ADMIN_EMAIL`/`ADMIN_PASSWORD` handling and got no answer, so I took the safe default — placeholders in `.env.example` only. I did not write or read any real credential. **Login will fail in every environment until you set those values locally and run `npm run seed:admin` once.**

=== BACKEND AGENT REPORT ===
```
Ticket: ADMINLOG-USR
Service: user-service
Date: 2026-08-19

Endpoints implemented:
POST /api/auth/login  ✓  200 token+admin / 400 missing fields / 401 invalid credentials / 500 config or server error
GET  /health          ✓  (pre-existing, unchanged — still first, unauthenticated, no DB)
GET  /health/ready    ✓  (pre-existing, unchanged)

Data models: Admin (uuid, email, passwordHash, createdAt)
  - toJSON transform maps uuid->id, strips _id/__v, and strips passwordHash at
    the schema level so no controller has to remember to select it out
  - unique indexes on uuid and email; not soft-deleted (single permanent account)

Files added:
  api/models/admin.model.ts
  api/lib/jwt.ts              (signAuthToken only — user-service signs, gateway verifies)
  api/auth/auth.service.ts    (business logic + DB access)
  api/auth/auth.controller.ts (request/response + status mapping only)
  api/auth/auth.routes.ts     (wiring only)
  api/scripts/seedAdmin.ts    (idempotent upsert, run via npm run seed:admin)
  api/auth/auth.test.ts, api/lib/jwt.test.ts, api/models/admin.model.test.ts

Files modified:
  api/app.ts        (mounted authRouter at /api/auth, replacing the scaffold comment)
  api/lib/config.ts (JWT_EXPIRES_IN default 1d -> 24h, per plan Open Question 2)
  package.json      (added seed:admin script)
  .env.example      (added ADMIN_EMAIL/ADMIN_PASSWORD placeholders; documented
                     that JWT_SECRET must be identical to api-gateway's)

Security decisions worth reviewing:
  - Unknown-identifier and wrong-password return a byte-identical 401 body, and
    the unknown path still runs a full bcrypt compare against a fixed dummy hash
    so response timing does not leak account existence. Both are asserted by test.
  - identifier/password are type-checked as strings before any query, so an
    object like { $ne: null } cannot become a NoSQL operator filter.
  - Password is never trimmed (leading/trailing spaces are valid characters),
    never logged, and never echoed in any response.
  - HS256 is pinned explicitly at signing; a blank JWT_SECRET throws rather than
    minting forgeable tokens, and surfaces as 500 (not 401).
  - Seed script hashes at bcrypt cost 12; tests use cost 4 for speed.

Unit tests: 40 passed, 0 failed  (tsc --noEmit clean)

Flags for the orchestrator:
  - docs/api-contract/api-contract.user-service.yaml does not exist; implemented
    against the api-gateway contract's /api/auth/login definition. Request field
    is `identifier` (email OR username), not `email`.
  - No rate-limiting/lockout on repeated failed logins — out of scope per the
    plan, but this is the only login endpoint and the root of trust for every
    future Admin route. Recommend security follow-up.
  - Seed step is manual and easy to forget: ADMIN_EMAIL/ADMIN_PASSWORD are
    placeholders only, so login fails until `npm run seed:admin` is run.

To run:
cd backend/user-service && npm run dev   # port 4002
cd backend/user-service && npm run seed:admin   # once per environment, first

STATUS: DONE
```

STATUS: DONE