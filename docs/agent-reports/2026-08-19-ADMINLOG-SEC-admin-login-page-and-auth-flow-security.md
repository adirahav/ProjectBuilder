I completed the security audit of the Admin Login feature (frontend, `user-service`, `api-gateway`, and the API contract).

**Critical finding:** `user-service`'s `signAuthToken` issues JWTs with `{userId, roles}` claims, but `api-gateway`'s `verifyAdminToken` requires `{sub, role}` claims. I verified this empirically — a token from a real successful login is rejected by the gateway's own `verifyJwt` middleware every time. This breaks the entire auth boundary the plan exists to establish; no admin can ever pass the guard that Screens 6–7 will depend on. It fails closed (safe), but the feature is non-functional end-to-end and must be fixed before merge.

Other findings: no rate-limiting on login (already an accepted deferred risk, reiterated), the frontend attaches the Admin JWT to `booking-service` requests unnecessarily (low), and informational notes on CORS/user-service direct reachability plus several confirmed good practices (timing-equalized bcrypt compare, generic 401s, no hash/PII leakage, alg-confusion closed, secrets properly gitignored).

Tests written to `docs/tests/security/admin-login-auth-flow.security.test.ts` (this repo's security-agent write boundary routes here rather than `tests/security/`), including a test that chains the real `signAuthToken` into the real `verifyJwt` to reproduce the critical bug — verified passing/reproducing via ad-hoc runs in each service's own test tree.

Report: `docs/agent-reports/2026-08-19-ADMINLOG-SEC-admin-login-page-and-auth-flow-security.md`

STATUS: DONE