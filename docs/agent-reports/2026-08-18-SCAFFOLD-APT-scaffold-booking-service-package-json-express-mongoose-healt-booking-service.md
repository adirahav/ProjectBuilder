Type-check clean, and `backend/booking-service/` is the only path I added. Everything else in `git status` predates my run (other agents' reports, orchestrator files).

**Deviations from the approved plan, and why:**

1. **Location & stack.** The plan said root-level `booking-service/` with CommonJS `src/server.js` + nodemon. The actual repo puts services under `backend/`, and `backend/api-gateway` is ESM TypeScript with `tsx` + Vitest. The plan's own intent was "mirror `api-gateway` exactly" — so I mirrored the real one: `backend/booking-service/`, `api/server.ts`, `tsx`, Vitest.

2. **`/health` and DB state.** The plan wanted `/health` to report DB state; my CLAUDE.md forbids `/health` touching the DB. Rather than pick a loser, I split them: `/health` is a pure liveness probe (200 always), and a new `/health/ready` reports `db` state (200 connected / 503 disconnected). It reads Mongoose's in-memory `readyState`, so it still issues no query. This is the standard liveness-vs-readiness split, and it means a DB blip degrades the service instead of getting a healthy process killed.

3. **`.env.development` was blocked** by the repo's `block-secret-file-access.js` guardrail hook. I did not bypass it — see the human action below. `config.ts` defaults are identical to what the file would contain, so the service runs correctly without it.

**Two items needing a human:**
- Create `backend/booking-service/.env.development` manually with `PORT=4001`, `MONGODB_URI=mongodb://localhost:27017/booking-service`, `FRONTEND_ORIGIN=http://localhost:5173`.
- `backend/.env.shared` has no `MONGODB_URI`. I asked which connection string to use but got no answer, so I used the plan's recommended local default. `MONGODB_URI` is shared with `user-service` and belongs in `.env.shared`, which is outside my allowed paths — please add it there.

Also note: `docs/api-contract/api-contract.booking-service.yaml` does not exist (the directory is empty). Not blocking for a scaffold-only ticket, but the routes ticket will need it.

=== BACKEND AGENT REPORT ===
```
Ticket: SCAFFOLD-APT
Service: booking-service
Date: 2026-08-18

Endpoints implemented:
GET /health        ✓  liveness — 200 {status:"ok"}, no auth, no DB access
GET /health/ready  ✓  readiness — 200/503 {status,db}, no DB query
(404 JSON fallback for unknown routes ✓)

Note: no contract file existed for this service; per the approved plan this
ticket is scaffold-only, so no business routes were implemented.

Data models: none — Service/TimeSlot/Appointment are explicitly out of scope
for this ticket (follow-up models ticket). DB connection wiring only.

Unit tests: 7 passed, 0 failed
Type-check: tsc --noEmit clean

To run:
cd backend/booking-service && npm run dev   # port 4001
```

STATUS: DONE