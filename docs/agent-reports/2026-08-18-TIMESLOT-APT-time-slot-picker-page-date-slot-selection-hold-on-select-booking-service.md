Env files already exist from the prior ticket, and no new configuration values are needed (the hold TTL is a code constant, not an env var). Working tree confirms changes are confined to `backend/booking-service/`.

**Summary of what I built:**

- **`api/models/time-slot.model.ts`** — `TimeSlot` schema with uuid external identity, `serviceId` ObjectId ref, status enum, and a `toJSON` transform that strips `_id`/`__v`/`uuid` **and `heldAt`** (the contract explicitly excludes the hold deadline from the payload).
- **`api/time-slot/time-slot.service.ts`** — the availability query plus the atomic hold.
- **`api/time-slot/time-slot.controller.ts`** — validation (uuid format, real calendar day), status-code mapping.
- **`api/time-slot/time-slot.routes.ts`**, mounted in `app.ts`.

Two judgment calls worth flagging:

**1. Schema shape diverges from `.rule/database-rules.md`.** The rules sketch `TimeSlot` as `startsAt`/`endsAt` Date fields, but the contract specifies a plain `date` (`YYYY-MM-DD`) plus wall-clock `startTime`/`endTime`, stating the day is "never a UTC instant, so the day can never shift under a client." Storing instants would reintroduce exactly the timezone drift the contract forbids, so I followed the contract and documented the divergence in the model.

**2. The 404-vs-409 lookup happens *after* the atomic update, never before.** The hold is one `findOneAndUpdate` whose filter admits both `open` and expired-`held` slots. Only when that matches zero documents do I check existence to distinguish "no such slot" from "already claimed" — off the write path, where it can't reintroduce a race.

=== BACKEND AGENT REPORT ===
```
Ticket: TIMESLOT-APT
Service: booking-service
Date: 2026-08-18

Endpoints implemented:
GET  /health                       ✓ (pre-existing, unchanged — still first, no auth, no DB)
GET  /health/ready                 ✓ (pre-existing, unchanged)
GET  /api/services                 ✓ (pre-existing, unchanged)
GET  /api/time-slots?serviceId=&date=  ✓ (F2/F3b — open-only, lazy hold expiry)
POST /api/time-slots/{id}/hold     ✓ (F3 — atomic open→held, 200/400/404/409/500/503)

Data models: Service (pre-existing), TimeSlot (new)

Unit tests: 61 passed, 0 failed (43 new for TimeSlot)
  - concurrency: 2 simultaneous holds → exactly one 200, one 409
  - concurrency: 12 simultaneous holds → exactly one 200, eleven 409
  - concurrency: 2 racing re-holds of an expired slot → exactly one winner
  - concurrency: holds on different slots → both succeed (no false serialization)
  - lazy expiry: expired hold returned as open and healed on read
  - status supplied in request body is ignored

To run:
cd backend/booking-service && npm run dev   # port 4001
```

Notes for the orchestrator (no action taken, flagged per instructions):
- **Rate limiting is not implemented.** `POST /hold` is an unauthenticated mutation endpoint an attacker could hammer to grief availability. The contract calls this a known follow-up, so I did not silently add it — worth routing to the `security` agent named in the plan's Scope-Agents.
- **No `held` → `booked` caller exists yet.** Until F4 lands, every hold placed simply expires back to `open` after the 5-minute TTL; nothing can currently be finalized into an Appointment. This is expected at this stage, not a defect.
- **Lazy expiry is scoped to the queried service/day**, so a slot on a day nobody browses can sit `held` indefinitely from an admin/reporting viewpoint (it self-heals on the next read). A real sweeper remains a follow-up, as the plan intended.
- **`.rule/database-rules.md` now disagrees with the shipped `TimeSlot` schema** (`startsAt`/`endsAt` vs `date`/`startTime`/`endTime`). I can't edit that file from this role — it should be reconciled so a future agent doesn't implement the instant-based shape against the same contract.

STATUS: DONE