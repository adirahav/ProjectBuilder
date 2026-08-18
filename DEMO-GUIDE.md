# Reference App — Presenter Guide

## Before the Session (15 min setup)

This repo is a **monorepo**: `frontend/` + `backend/` with two microservices (`user-management-service`, `tour-service`). Everything runs locally — there's no external backend to point at.

### 1. Environment
```bash
cp frontend/.env.example frontend/.env.development
cp backend/user-management-service/.env.example backend/user-management-service/.env.development
cp backend/tour-service/.env.example backend/tour-service/.env.development
# Fill in MONGODB_URI, DB_NAME (REFERENCE_APP_DB), JWT_SECRET (same value in both backend services),
# JWT_EXPIRES_IN, and FRONTEND_URL
```

### 2. Install dependencies
```bash
npm install --prefix frontend
npm install --prefix backend/user-management-service
npm install --prefix backend/tour-service
```

### 3. Pre-run test (night before!)
```bash
npm --prefix backend/user-management-service run dev   # port 3032
npm --prefix backend/tour-service run dev               # port 3033
npm --prefix frontend run dev                            # port 5173
```
- Open http://localhost:5173 — verify the Gateway/Entry view appears
- Log in as an admin, create a test tour + bus, and confirm the seat map renders
- As a passenger, submit a seat request and confirm it shows as `pending`

### 4. Linear (optional)
- Have your Linear workspace open in browser
- Set `LINEAR_API_KEY` and `LINEAR_TEAM_ID` in `.mcp.json` / env, or omit them and the loop simulates tickets instead
- Linear API key: Settings → API → Personal API keys

### 5. VSCode / Terminal setup
- Open the project folder in VSCode
- Open 4 terminal panes: Orchestrator (dev-loop) | user-management-service | tour-service | Frontend (`npm run dev`)
- Font size 18+ for audience readability

---

## On Stage — Step-by-Step Script

### Opening (2 min)
> "We have a PRD and designs from AI Studio — a tour and bus seat-booking system.
> Normally this would take a dev a while. Watch what happens when we have an agent team instead."

Show:
- `docs/PRD.md` briefly (the requirements — passengers request seats, admins manage everything)
- `raw_from_ai_studio/` design files briefly
- The seat-status color coding: available / pending / taken / reserved

### Run the Orchestrator (3 min)

In Terminal 1 (Orchestrator pane):
```bash
node development/dev-loop.js
```

The orchestrator will:
1. Pick the next task from `.plan/000-backlog.md`
2. Read the PRD and design files
3. Print the implementation plan
4. **PAUSE** — waiting for your approval

> "See this? The agent stops and waits. It won't proceed without human sign-off.
> This is the plan gate — I'm the Orchestrator now."

Read the plan out loud (30 seconds), then type:
APPROVED

### Linear Tickets (1 min)

The script creates 5 tickets for this task: Frontend, Backend — user-management-service, Backend — tour-service, QA, and Security. Switch to browser — show Linear.
> "Two backend tickets, because we have two independent microservices. They're going to run
> in parallel — no reason for one to wait on the other."

### Frontend Agent (4–5 min)

> "The orchestrator now launches the Frontend agent with its ticket."

The agent runs in the terminal. Talk through what it's doing as it streams:
- Extending the existing pages/services/store (already-scaffolded React + Vite + Zustand app)
- Building the seat map with the four-state color coding
- Wiring loading/error/seat-conflict states through `sonner` toasts
- Writing the two API contracts under `docs/api-contract/`

> "Notice — it defines the exact API contract both backend services must implement.
> The frontend agent owns the API shape; the backend agents build to match it."

When lint/build (and tests, if in scope) pass, the agent prints `STATUS: DONE`.

### Backend Agents — in parallel (4–5 min)

> "Now watch — two backend agents launch at the same time, one per microservice."

Split attention between the two terminal panes as they stream:
- **user-management-service**: admin signup/login/logout/forgot-password, JWT issuing
- **tour-service**: tour/bus CRUD, and the seat lifecycle — this is the part worth slowing down for

> "This seat-service file is the highest-risk code in the whole app. Two passengers could
> request the same seat at the same instant — the agent has to use an atomic, condition-checked
> update, not a naive read-then-write, or we'd get double-bookings."

When both print `STATUS: DONE`:
> "Both services built independently, to the same contract the frontend defined. That's the
> whole point of a contract-first workflow."

### QA Agent (2–3 min)

> "Both backends reported done. Orchestrator now launches QA to verify against the PRD's
> acceptance criteria — including the one that matters most here."

Call out AC-7 specifically when QA runs it:
> "QA is about to fire two simultaneous seat requests for the same seat. Exactly one should
> succeed, the other should get a 409. This is the test that actually proves the concurrency
> guard works — not just that the code compiles."

When it prints `STATUS: DONE`:
> "QA confirms the change meets every acceptance criterion before we sign off."

### Approval + Security Agent (2–3 min)

> "After QA passes, I approve the feature — then the orchestrator launches the Security agent
> to audit both backend services, the frontend, and the API contracts before we call this done."

When it prints `STATUS: DONE`:
> "No token leakage, no hardcoded secrets, no seat status accepted directly from client input,
> no unsafe error surfacing. Ready to ship."

### Live App Demo (3 min)

> "Let's see what was built."

Open `http://localhost:5173`:
- Enter as a passenger — pick a tour, pick a bus, view the live seat map
- Submit a seat request — watch the seat turn to `pending` immediately
- Switch to the admin view, log in, approve the request — watch it turn to `taken`
- Try a manual assign or a seat swap in the admin seat management tab
- Open the manifest report — filter by pickup point, hit "copy consolidated report"

> "One consistent set of conventions — services, Zustand slices, sonner toasts, the seat-state
> machine — followed automatically by every agent. Two independent backend services, built in
> parallel, to a contract neither one had to guess at."

---

## What to Say at Each Human Checkpoint

**Plan approval:**
> "I'm reading this plan as the Orchestrator. I'm checking:
> does this match the PRD? Is the ticket scoped correctly?
> Is the data model aligned with our naming conventions and glossary — `tour`, not `trip`?
> I'm satisfied — APPROVED."

**After Frontend DONE:**
> "The agent stopped and reported. I can read the report, check the two API contracts it wrote,
> and review the pages and store slices it touched.
> I'm the quality gate — not a passive observer."

**After both Backend agents DONE:**
> "Two independent services, built to the same contract, with no coordination needed between
> them beyond that contract. That's the value of the API-contract-first approach."

**After QA and Security DONE:**
> "Verified against the PRD — including the concurrency guarantee — and audited for security.
> Time to ship."

---

## If Something Goes Wrong

| Problem | Fix |
|---------|-----|
| `claude CLI not found` (or not logged in / session limit hit) | Script does NOT fall back to simulation — it prints the reason in red and pauses, waiting for Enter to retry that exact step. Fix the CLI/login/limit, then press Enter in the Orchestrator pane — the demo resumes from where it stopped, nothing is redone |
| Linear API error | Leave `LINEAR_API_KEY` unset — script simulates tickets |
| MongoDB connection fails | Check `MONGODB_URI`/`DB_NAME` in both backend `.env.development` files |
| 401 loops between frontend and backend | Confirm `JWT_SECRET` is identical in both `backend/*/.env.development` files |
| A seat request never resolves / stays `pending` forever | Check `tour-service` logs — the admin approve action may not be reaching it; confirm the admin JWT is attached |
| Frontend tests fail | Run `npm --prefix frontend run test` to see which test — note tests may not be set up yet, see `.rule/testing-rules.md` |
| Backend tests fail | Run `npm --prefix backend/<service> run test` to see which test |
| Lint/build fails | Run `npm --prefix frontend run lint` / `npm --prefix frontend run build` directly to see the error |
| Port already in use | `npx kill-port 5173` / `npx kill-port 3032` / `npx kill-port 3033` |

---

## What This Demo Teaches

| Concept                       | Where it shows up                                                                                     |
|--------------------------------|--------------------------------------------------------------------------------------------------------|
| Spec-Driven Dev                | PRD → agents read it, don't guess                                                                       |
| Agent roles                    | Frontend defines the API shape; two backend agents implement it independently, in parallel              |
| Human checkpoints              | Plan approval gate before any code is written                                                            |
| The Loop                       | Lint/build/tests fail → agent self-fixes → re-runs until pass                                            |
| Contract-first parallelism     | Two microservices built at the same time, to a shared contract, with zero cross-talk needed              |
| Concurrency as a first-class requirement | Seat-booking race condition is called out explicitly, tested explicitly (AC-7), and audited explicitly (Security agent) |
| Linear as coordination layer   | Tickets link agents to requirements                                                                      |
| Security by design             | Seat status is server-controlled only, never trusted from client input — enforced by contract, checked by the Security agent |