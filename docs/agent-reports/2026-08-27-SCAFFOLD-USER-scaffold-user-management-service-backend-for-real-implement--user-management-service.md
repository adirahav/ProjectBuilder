The service now exists on disk for real, with a passing test suite.

=== BACKEND AGENT REPORT ===
```
Ticket: SCAFFOLD-USER
Service: user-management-service
Date: 2026-08-27

Endpoints implemented:
GET  /health              ✓ (mounted first, no auth, no DB touch)
POST /api/auth/signup     ✓ (201 / 400 VALIDATION_FAILED / 409 EMAIL_TAKEN / 500)

Deliberately NOT implemented (out of scope per .plan/011):
POST  /api/auth/login       — ticket GATEWAYL-FE / plan 006
PATCH /api/admins/:id/roles — F2b role promotion, separate ticket
(The JWT, error and Admin-model infrastructure they reuse is already in place,
including `requireAdmin` in api/lib/auth.middleware.ts.)

Data models: Admin (uuid, fullName, email [unique index], passwordHash, roles,
             createdAt, deletedAt — soft-deleted, toJSON strips _id/__v/passwordHash)

Unit tests: 25 passed, 0 failed
Typecheck: passed (tsc --noEmit, no errors)

To run:
cd backend/user-management-service && npm run dev   # port 4002
```

**Flags for the orchestrator — please read:**

1. **Port mismatch in my launch input.** I was given `Port: 4001`, but 4001 is already `tour-service`'s port (`backend/tour-service/.env.example`). The API contract's server default and `.plan/011` step 9 both say **4002**. I used 4002. If 4001 was intentional, this needs correcting somewhere.

2. **`.env.development` could not be written** — a repo guardrail hook (`.claude/hooks/block-secret-file-access.js`) blocks all `.env*` writes. This is fine: `development/dev-loop.js`'s `ensureBackendEnv()` generates the local env file from `.env.example` and reuses `backend/.env.shared`'s `JWT_SECRET`/`MONGODB_URI`. I wrote `.env.example` (placeholders only) as its input. **`JWT_SECRET` must end up byte-identical to `tour-service`'s** — this service issues the tokens that one verifies.

3. **Model naming deviates from `.plan/011` step 6, deliberately.** The plan says `User`/`user.model.ts`; `.rule/naming-rules.md`, `.rule/glossary.md` and `agents/backend/CLAUDE.md` all say the canonical entity is `admin` and that `user` is reserved for the *role value*. I built `Admin` in `api/admin/`. The API surface is unchanged — the contract's `AuthUser` shape is matched exactly.

4. **Deviation from `.rule/database-rules.md`.** That file lists `admin.username` as required+unique. The contract supersedes it (`fullName` on signup, email as login identifier, "no separate `username` field"). A unique index on a display name would also reject two identically-named people. Documented in a comment in `Admin.model.ts`. **`.rule/database-rules.md` may want updating.**

5. **Plan steps 11 and 13 are outside my allowed paths** — frontend integration verification (`SignupPage.test.tsx`) and marking plans 003/010 superseded. Both still pending; please route to the frontend/QA agents and yourself.

Role invariant is covered by three dedicated tests: client-supplied `roles`/`role`/`isAdmin` are structurally unreachable (the validator never reads them), and the concurrent-duplicate-email test proves the DB unique index — not the app-level pre-check — is what stops a double signup.

STATUS: DONE