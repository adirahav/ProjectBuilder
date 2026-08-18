Scaffolded `backend/user-service` mirroring the existing `booking-service`/`api-gateway` conventions (TS + Express + tsx + Vitest), not the plan's older CommonJS assumption — the plan predates those scaffolds and CLAUDE.md mandates the current stack.

Notes for the orchestrator:
- **`.env.development` could not be written** — the repo guardrail hook blocks writes to that filename. Shared values (`MONGODB_URI`, `JWT_SECRET`) already exist in `backend/.env.shared`; `development/dev-loop.js`'s `ensureBackendEnv()` should generate the per-service file. `.env.example` is committed with `PORT=4002`.
- `bcryptjs` used per the plan's Open Question 1 (CLAUDE.md said `bcrypt`); `jsonwebtoken` + `bcryptjs` installed but deliberately unwired — no Admin model, no `/api/auth/login`, per plan scope.
- No API contract file exists at `docs/api-contract/api-contract.user-service.yaml`, so only the health/readiness routes are implemented.
- `backend/package.json` untouched (forbidden path); no root manifest exists.

=== BACKEND AGENT REPORT ===
```
Ticket: SCAFFOLD-USR
Service: user-service
Date: 2026-08-18

Endpoints implemented:
GET /health          ✓  (200 {status:"ok"}, no auth, no DB access)
GET /health/ready    ✓  (200/503 {status, db} from Mongoose readyState)
404 catch-all        ✓

Data models: none (Admin model deferred to the follow-up F5 ticket, per plan scope)

Unit tests: 8 passed, 0 failed

To run:
cd backend/user-service && npm run dev   # port 4002

STATUS: DONE
```

STATUS: DONE