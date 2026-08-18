Scaffold complete. Typecheck clean, all tests pass, and only `backend/api-gateway/` was created — no other service, `frontend/`, or `backend/package.json` was touched.

**Deviations from the approved plan (flagged deliberately):** the plan proposed root-level `api-gateway/` with CommonJS `src/server.js` + `nodemon`. That conflicts with my CLAUDE.md and `.rule/coding-rules.md`, which both mandate `backend/api-gateway/` with TypeScript + `tsx` + Vitest. I followed the rules; the plan's Open Question 1 (no sibling service existed to mirror) is now answered — this scaffold is the reference pattern.

=== BACKEND AGENT REPORT ===
```
Ticket: SCAFFOLD-GW
Service: api-gateway
Date: 2026-08-18

Endpoints implemented:
GET /health  ✓  (200, {"status":"ok"}, unauthenticated, no DB, not proxied)
* (catch-all) ✓  404 JSON fallback

Data models: none — api-gateway is a stateless gateway with no DB connection (per CLAUDE.md Step 3)

Unit tests: 3 passed, 0 failed
Typecheck: tsc --noEmit clean

Files created (all under backend/api-gateway/):
  package.json, package-lock.json, tsconfig.json, vitest.config.ts, .gitignore
  .env.example
  api/server.ts        - entrypoint, listen only
  api/app.ts           - createApp(); /health mounted FIRST, then CORS, then 404
  api/lib/config.ts    - env access, no hardcoded credentials
  api/health.test.ts   - 3 tests

To run:
cd backend/api-gateway && npm run dev   # port 4000

STATUS: DONE
```

Items needing attention from the orchestrator/human:

1. **API contract missing.** `docs/api-contract/api-contract.api-gateway.yaml` does not exist — `docs/api-contract/` is empty. I built the scaffold-only surface the ticket defined. The contract must exist before the proxy/routing ticket, since that work is contract-driven.
2. **Auth boundary not enforced** (matches the plan's own Risk). No JWT verification and no proxy routes yet — an explicit `NOTE` comment in `api/app.ts` marks where they go. This build must not be deployed as if it gates admin traffic. `security` should confirm the JWT-middleware follow-up is tracked.
3. **No local env file written.** A repo guardrail hook blocks writing `.env.development`. This is fine: `development/dev-loop.js` → `ensureBackendEnv("api-gateway")` generates it from the `.env.example` I committed, prompting for `JWT_SECRET` and reusing it via `backend/.env.shared` so it stays identical to `user-service`.
4. **Tooling gotcha for future backend agents:** `npm --prefix backend/<service> ...` fails on this Windows setup (npm 9.8.1) with `ENOENT ... PROJECT-BUILDER/package.json` — there is no root manifest. Use `cd backend/<service> && npm ...` instead. Also, `tsx` resolves `.ts` import specifiers but `tsc` requires `"allowImportingTsExtensions": true`, which is set in the tsconfig.

STATUS: DONE