All checks pass, and the build confirms the artifact shape the gateway expects (`frontend/dist/index.html` + `dist/assets/`).

**What I changed (frontend-side only — the gateway work in this plan belongs to the backend agent):**

- **`frontend/vite.config.ts`** — pinned `build.outDir` to `dist` explicitly. It was only a Vite default before; now that api-gateway serves that directory, the path is a cross-package contract and shouldn't move silently.
- **`frontend/src/services/http.service.ts`** — added `resolveBaseUrl()`. An unset `VITE_*_URL` now resolves to `''` (relative, same-origin) and only warns in **dev** builds. Previously it warned unconditionally as a "configuration error" — but in the single-origin production deploy, unset is the *correct* state: requests become relative `/api/...` paths answered by the gateway that served the page. Trailing-slash normalisation moved into that one helper (removed the duplicate in `createClient`).
- **`frontend/.env.example`, `frontend/README.md`** — documented the two-step deploy (`build frontend` → `start api-gateway`), added the previously-undocumented `VITE_API_GATEWAY_URL` row, and flagged the Capacitor exception.
- **`frontend/src/services/http.service.test.ts`** — regression tests: base URLs resolve to `''` when unconfigured, endpoints stay relative, trailing slashes are stripped.

**Two things worth your attention:**

1. **Capacitor is the exception to single-origin.** The native build runs from a `capacitor://` origin with no gateway behind it, so relative paths break there — both `VITE_*_URL` vars must be set to absolute reachable hosts before `cap:sync`. Documented, but it means native and web deploys need different env handling.
2. **Open Question 4 still bites at deploy time.** Public booking routes (`GET /api/services`, time-slots, `POST /api/appointments`) still go direct to booking-service on `:4001`. Under single-origin, if you leave `VITE_BOOKING_SERVICE_URL` unset, those relative calls hit the *gateway*, which does not proxy them today — the public booking flow would 404. So either booking-service stays externally exposed with its URL set explicitly, or the gateway must proxy those public routes. The plan defers this, but it blocks a genuinely single-port deploy.

I did not write an API contract file — no endpoints were added or changed. I also did not verify the running app visually (no dev server, per instructions); the gateway-side `curl` validations in the plan are the backend agent's to run.

=== FRONTEND AGENT REPORT ===
```
Ticket: DEPLOYSE-FE
Pages built/changed: none
Services built/changed: frontend/src/services/http.service.ts (single-origin base URL resolution)
Store slices built/changed: none
Config/docs changed: frontend/vite.config.ts, frontend/.env.example, frontend/README.md
Lint: PASS
Build: PASS (dist/index.html + dist/assets/)
Tests: 514 passed, 0 failed (28 files)
API contracts:
  - none — no new or changed endpoints in this ticket

Handoff to Backend Agent:
- frontend/dist is the confirmed build output path; mount express.static there
- Mount static + SPA fallback AFTER /health and /api/* so 401/404 semantics are preserved
- Production build ships with no VITE_*_URL set, so all requests arrive as relative /api/... on the gateway origin
- BLOCKER to confirm: public booking routes (/api/services, /api/time-slots, POST /api/appointments) are not gateway-proxied today and will 404 under single-origin unless proxied or booking-service stays exposed
```

STATUS: DONE