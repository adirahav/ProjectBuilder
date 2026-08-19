# Security Review — ADMINLOG-SEC: Admin Login page and auth flow

- Plan: `.plan/011-2026-08-19-admin-login-page-and-auth-flow.md`
- Reviewed: `backend/user-service/api/auth/*`, `backend/user-service/api/models/admin.model.ts`, `backend/user-service/api/lib/jwt.ts`, `backend/user-service/api/scripts/seedAdmin.ts`, `backend/api-gateway/api/auth-proxy/*`, `backend/api-gateway/api/routing/routing.middleware.ts`, `backend/api-gateway/api/lib/jwt.ts`, `frontend/src/store/slices/auth.slice.ts`, `frontend/src/services/{auth,http,util}.service.ts`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/pages/AdminLoginPage.tsx`, `frontend/src/utils/auth.utils.ts`, `docs/api-contract/api-contract.api-gateway.yaml`
- Tests added: `docs/tests/security/admin-login-auth-flow.security.test.ts` (placement per this repo's `security` agent write-boundary; run instructions inside the file — verified working via ad-hoc copies into each service's own `api/` test tree, see Verification below)

## Summary

The credential-handling core of this feature (bcrypt hashing, generic 401s, timing-equalized comparison, no user-enumeration, no secrets in responses, safe error handling) is implemented carefully and correctly. However, there is **one critical integration bug that breaks the entire authentication boundary**: the JWT `user-service` signs and the JWT `api-gateway` verifies use incompatible claim shapes, so a token issued by a real, successful login is always rejected by `verifyJwt`. Every future Admin route (Screens 6–7) that depends on this middleware will 401 for every legitimately authenticated Admin until this is fixed. There are also a few lower-severity findings around token exposure surface and defense-in-depth for the (explicitly deferred) brute-force risk.

## Findings

### 1. CRITICAL — `signAuthToken`/`verifyAdminToken` claim mismatch: no admin can ever pass `verifyJwt`

- `backend/user-service/api/lib/jwt.ts` — `signAuthToken(payload: { userId, roles })` signs `{ userId, roles, iat, exp }`. No `sub`, no `role`.
- `backend/user-service/api/auth/auth.service.ts:88` — calls it as `signAuthToken({ userId: String(admin.uuid), roles: ['admin'] })`.
- `backend/api-gateway/api/lib/jwt.ts` — `verifyAdminToken` requires `decoded.sub` to be truthy and `decoded.role === 'admin'`; anything else throws `JwtVerificationError` → the middleware answers `401 Unauthorized`.

Consequence: a real Admin who submits correct credentials gets a `200` with a valid, correctly-signed token from `user-service` (or via the gateway proxy) — and that exact token is then rejected by the gateway's own `verifyJwt` on the very next request. The middleware fails closed (safe), but the feature is non-functional end-to-end: there is currently no way for any Admin to reach a route gated by `verifyJwt`. This blocks every route Screens 6–7 will add behind it (F6–F11).

**Why this wasn't caught by the existing test suites**: each service's unit tests are internally consistent but never exercise both sides together —
- `backend/user-service/api/auth/auth.test.ts:60-61` asserts the signed token contains `decoded.userId`/`decoded.roles` (matches the sign side, as expected).
- `backend/api-gateway/api/routing/routing.middleware.test.ts` hand-constructs tokens with `jwt.sign({ sub, role }, ...)` directly rather than importing `user-service`'s real `signAuthToken` (matches the verify side, as expected).

Both suites pass in isolation while the integration is broken — a textbook contract-mismatch gap. `docs/tests/security/admin-login-auth-flow.security.test.ts` adds a test that imports the *real* `signAuthToken` from `user-service` and feeds its output into the *real* `verifyAdminToken`/`verifyJwt` from `api-gateway`, reproducing the failure directly (confirmed failing as expected — see Verification).

**Fix** (either direction is fine, but pick one and update both sides + their unit tests):
- Preferred: make `signAuthToken` accept/emit `sub` (the admin uuid) and `role: 'admin'`, e.g. `jwt.sign({ role: 'admin' }, secret, { subject: adminId, expiresIn, algorithm: 'HS256' })`, or literally include `sub`/`role` in the payload object passed to `jwt.sign`.
- Or: change `verifyAdminToken` to read `decoded.userId`/`decoded.roles.includes('admin')` instead of `sub`/`role`. (Less preferred — `sub` is the JWT-standard subject claim and `x-internal-admin` downstream services will eventually rely on, so aligning the signer to the RFC-7519 convention is cleaner.)
- Either way, add one automated test that actually chains `signAuthToken` → `verifyAdminToken` (the two currently only get unit-tested against hand-built fixtures matching their own side), so this class of bug cannot reappear silently.

**Severity: Critical.** Not exploitable as an attacker-facing vulnerability (it fails closed), but it is a complete break of the auth flow this entire plan exists to deliver, and must be fixed before Screens 6–7 build on top of `verifyJwt`.

### 2. Medium — No rate-limiting/lockout on `POST /api/auth/login` (already flagged as an accepted risk)

Confirmed as implemented: `backend/user-service/api/auth/auth.controller.ts` and `backend/api-gateway/api/auth-proxy/auth-proxy.controller.ts` have no throttling, and neither `app.ts` mounts any limiter. This is explicitly called out in the plan's Risks section as deferred out of scope for v1, so it is not a new finding — this review reiterates it as a **follow-up recommendation** given the endpoint is now live: the single Admin account has no lockout, so an attacker with network access to the gateway can attempt unlimited password guesses at whatever rate the transport allows. Recommend adding a per-IP and/or per-identifier rate limiter (e.g. `express-rate-limit`) on `/api/auth/login` on the gateway (and/or user-service) in a follow-up ticket, before this becomes internet-reachable in a real deployment.

### 3. Low — Admin JWT is attached to requests sent to `booking-service`, not only `api-gateway`

`frontend/src/services/http.service.ts` builds two axios clients — `httpService` (bound to `BOOKING_SERVICE_URL`, used by the public, unauthenticated booking screens) and `gatewayHttpService` (bound to `API_GATEWAY_URL`). Both clients share the identical request interceptor (`createClient`), which unconditionally attaches `Authorization: Bearer <token>` whenever a token is present in storage — including on `httpService`'s calls to `booking-service`. Once an Admin is signed in, if they navigate to any public booking page in the same browser tab/session, their Admin JWT is sent to `booking-service` on every request, even though `booking-service` never needs it and has no verification for it.

This isn't currently exploitable (booking-service ignores the header), but it's unnecessary exposure of a sensitive credential to an extra network surface (increases blast radius if `booking-service` ever logs headers, is proxied through something that logs, or gains a bug that echoes headers back). Recommend restricting the Authorization-attaching interceptor to `gatewayHttpService` only, since only Admin routes (proxied through the gateway) ever need it.

### 4. Informational — `user-service` is directly reachable with the frontend origin allowed by CORS

`backend/user-service/api/app.ts` sets `cors({ origin: config.frontendOrigin, credentials: true })` on the same origin the gateway allows, meaning a browser client could call `user-service`'s `/api/auth/login` directly, bypassing `api-gateway` entirely. For this task that's harmless (it's the same login logic either way, and the plan explicitly chose to proxy through the gateway for architectural reasons, not security ones). Flagging so that when Screens 6–7 add protected business routes to `user-service` (if any land there directly rather than via the gateway), the team confirms those routes are not reachable in a way that bypasses `verifyJwt`. No action needed for this task.

### 5. Informational — confirmed good practices worth preserving

- `admin.service` timing-equalizer hash (`auth.service.ts:29`) — bcrypt.compare always runs against a real hash even for an unknown identifier, closing the classic user-enumeration-by-timing gap. Verified by test.
- Identical `401` body/status for "unknown account" vs "wrong password" on both `user-service` and the gateway proxy — verified by existing tests and this review's reading of both controllers.
- `admin.model.ts`'s `toJSON` transform strips `passwordHash`, `_id`, `__v` at the schema level rather than relying on each controller to remember `.select('-passwordHash')` — a solid structural guard against accidental hash leakage as the Admin model grows.
- `signAuthToken` pins `algorithm: 'HS256'` explicitly on sign; `verifyAdminToken` relies on `jwt.verify`'s own algorithm detection from the token header rather than accepting a caller-supplied list — confirmed an `alg: none` forged token is rejected (test added).
- `seedAdmin.ts` is not run on boot, requires explicit env vars, never logs the password, and is idempotent (`upsert`) — matches the plan's Open Question 1 recommendation.
- `.env.development`/`.env.production` files (real secrets) are correctly `.gitignore`d at the repo root; only `.env.example` (placeholder values) is tracked, for both `user-service` and `api-gateway`.
- The gateway's `auth-proxy.controller.ts` never forwards arbitrary client headers to `user-service` (only a hand-built JSON body with exactly `identifier`/`password`) — confirmed by test; a spoofed `x-internal-admin` header cannot reach the upstream call.
- `localStorage` token storage (Open Question 4) — the XSS-exfiltration tradeoff is accepted per the plan's own reasoning; no additional finding beyond what the plan already documents, other than Finding 3 above about over-broad attachment.

## Verification

Ran the new tests against real code via ad-hoc copies inside each service's own `api/` test tree (this environment's `vitest.config.ts` `include: ['api/**/*.test.ts']` in both services does not discover files outside that glob, including via an explicit CLI path — the same constraint applies to the pre-existing `tests/security/customer-details-form.security.test.ts`, which also could not be discovered this way in this environment). The delivered file at `docs/tests/security/admin-login-auth-flow.security.test.ts` contains the exact same test bodies as verified:

- `user-service` — 3/3 passed: token payload shape pinned to `{userId, roles}` (no `sub`/`role`), NoSQL-operator identifier rejected with `400` before any DB call, timing-equalizer bcrypt compare confirmed to run against a non-empty hash.
- `api-gateway` — the CRITICAL cross-service test passed (i.e., it correctly reproduced the bug): a token minted by `user-service`'s real `signAuthToken()` was rejected with `401 { error: 'Unauthorized' }` by the gateway's real `verifyJwt`/`verifyAdminToken`.

Recommend the orchestrator either (a) fix `vitest.config.ts`'s `include` in both services to also pick up `../../docs/tests/security/**/*.test.ts` (or move/symlink this suite under each service's own `api/` tree), or (b) accept that this class of security test is documentation-verified-once rather than CI-enforced in this repo's current test-runner configuration, and track that as a tooling follow-up.

## Recommendation

**Do not consider this task's auth flow complete/mergeable until Finding 1 is fixed.** It is the reason the "establishes the JWT-verification middleware that all future Admin screens will depend on" goal in the plan is currently not actually met — the middleware exists and is correctly defensive, but is unreachable-by-design for the only tokens the system issues. Findings 2–4 are follow-ups/acceptances, not blockers.
