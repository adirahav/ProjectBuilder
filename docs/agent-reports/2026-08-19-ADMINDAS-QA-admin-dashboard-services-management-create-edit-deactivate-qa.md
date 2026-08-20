QA validation complete across booking-service (178 tests), api-gateway (86 tests), and frontend (lint/build/400 tests) — all pass. Report written to `docs/agent-reports/2026-08-19-ADMINDAS-QA-admin-dashboard-services-management-create-edit-deactivate-qa.md`.

Key finding: a **critical, pre-existing, cross-service JWT claim mismatch** (user-service signs `{userId, roles}`, api-gateway expects `{sub, role}`) blocks real Admin end-to-end usage of this feature, despite every layer's own tests passing. This was already flagged by the earlier security review and reconfirmed here — it needs a follow-up fix in user-service/api-gateway before the feature is truly shippable. Also flagged a stale booking-service contract doc (still says F6-F8 "deliberately absent").

STATUS: DONE