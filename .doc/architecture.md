# System Architecture

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of the Dog Grooming Clinic Booking system.

---

## System Overview
Polyrepo-style monorepo: one `frontend/` (React web + Capacitor native shell) and one `backend/` directory containing three independent Node/Express microservices, each with its own `package.json`, port, and MongoDB connection (or shared cluster, separate logical DB/collections per service).

```
frontend/                      backend/
  src/                           gateway/
    pages/                       appointment-service/
    components/                  user-service/
    services/
    state/
```

```
Browser (web) ─┐
Native shell ──┼──▶ gateway (:5000) ──▶ appointment-service (:5001)
 (Capacitor)   ┘                    └─▶ user-service (:5002)
```

All client traffic (web and native) goes through the `gateway`. The gateway verifies the JWT on incoming requests and forwards to the owning downstream service with trusted internal headers (`x-user-id`, `x-user-role`) attached; downstream services never re-verify the token themselves (gateway-centralized auth model).

---

## Context
**Problem solved:** Replace phone/message-based appointment booking at a small dog grooming clinic with a self-service flow where customers see live slot availability and book directly, and the owner manages services and appointments from one dashboard.

**Key architectural constraints:**
- `TimeSlot` is a contested resource — at most one `Appointment` may hold a given `TimeSlot`; concurrent booking attempts must resolve safely (see `seat-concurrency-layer` skill, adapted for `TimeSlot`).
- Guest-only booking — no `Customer` authentication, so the booking flow must work without a session/token while still being abuse-resistant.
- Only `Admin` is an authenticated role; `user-service` owns admin accounts and login, `gateway` centralizes JWT verification for all downstream services.
- Small-team/single-clinic scale — no multi-groomer/multi-resource scheduling in v1.
- Bilingual UI (Hebrew RTL default / English LTR) and both web and native (Capacitor) targets.

---

## Primary Components

### Frontend
| Layer | Choice |
|---|---|
| Framework | React + Vite (TypeScript) |
| Styling | Tailwind CSS v4, RTL/LTR via logical properties |
| State management | Zustand |
| HTTP client | fetch-based service layer, one file per entity |
| Auth storage | JWT stored client-side (admin only), attached as `Authorization: Bearer <token>` |
| Icons | Lucide React |
| Native shell | Capacitor (Android/iOS) wrapping the same web build |

Two main functional areas:
- **Public booking flow** (`Customer`, unauthenticated): service list → `TimeSlot` picker → contact details → confirmation.
- **Admin console** (`Admin`, authenticated): login, service management (create/edit/deactivate `Service`), appointments dashboard (view/confirm/cancel `Appointment`).

**Android/iOS App:** Capacitor wraps the web build as-is; no server-side rendering or platform-specific API surface. Native-specific concerns are limited to back-button/navigation-stack behavior (see `native-navigation-layer` skill) and native storage for the admin JWT. No iOS-only or Android-only features are in scope for v1 — both platforms ship the same feature set.

### Backend

| Service | Base-URL env var | Responsibility |
|---|---|---|
| `gateway` | `GATEWAY_URL` (default `http://localhost:5000`) | Reverse proxy for all client traffic; verifies JWT; attaches `x-user-id`/`x-user-role` internal headers; routes to `appointment-service` and `user-service`. |
| `appointment-service` | `APPOINTMENT_SERVICE_URL` (default `http://localhost:5001`) | Owns `Service`, `Appointment`, `TimeSlot` models and routes; the `TimeSlot` concurrency-safe claim logic lives here. |
| `user-service` | `USER_SERVICE_URL` (default `http://localhost:5002`) | Owns `Admin` accounts, login, JWT issuance. Does not store `Customer` records — those live only on `Appointment`. |

Each service follows a `controller/service/routes/middleware` folder-per-domain internal layout (see `backend-service-layer` skill).

**`TimeSlot` lifecycle (contested entity):**
```
available ──(hold: booking attempt starts)──▶ held ──(book: appointment committed)──▶ booked
    ▲                                            │
    └───────────(hold expires / booking fails)───┘
    ▲
    └───────────────(cancel: appointment cancelled)───────────────────── booked
```
- `available → held`: a `Customer` starts a booking transaction for this `TimeSlot`.
- `held → booked`: the `Appointment` (status `pending`) is committed atomically with the `TimeSlot` claim.
- `held → available`: the hold expires (timeout) or the booking transaction fails/aborts.
- `booked → available`: the owning `Appointment` is cancelled.

---

## File Structure
```
frontend/
  src/
    pages/            # <Name>Page.tsx per screen
    components/        # feature-grouped, PascalCase
    services/           # service.service.ts, appointment.service.ts, timeslot.service.ts, auth.service.ts
    state/               # Zustand slices
    router/
    i18n/                # he/en resource bundles
backend/
  gateway/
    src/
      middleware/        # jwt verification, proxy config
      routes/
  appointment-service/
    src/
      service/             # domain: service, appointment, timeslot
        service.controller.ts / service.service.ts / service.routes.ts
        appointment.controller.ts / appointment.service.ts / appointment.routes.ts
        timeslot.controller.ts / timeslot.service.ts / timeslot.routes.ts
      models/
  user-service/
    src/
      admin/
        admin.controller.ts / admin.service.ts / admin.routes.ts
      models/
```

---

## Data Flow

**Admin login (auth flow):**
```
Admin UI
  → POST GATEWAY_URL/api/auth/login          (email + password)
        → user-service verifies credentials, issues JWT { userId, role: 'admin', iat, exp }
        → gateway returns JWT to client; client stores it and attaches it as Bearer token on future requests
```
Every subsequent request from the admin console goes through `gateway`, which verifies the JWT and attaches `x-user-id`/`x-user-role` headers before proxying to `appointment-service` or `user-service`. Downstream services trust these headers and do not re-verify the token.

**Guest booking flow (core create flow, contested entity):**
```
Customer UI
  → GET  GATEWAY_URL/api/services                         (list active Services)
  → GET  GATEWAY_URL/api/timeslots?date=&serviceId=        (list available TimeSlots for a date/service)
  → POST GATEWAY_URL/api/appointments                      (serviceId, timeSlotId, customer name+phone)
        → appointment-service atomically holds the TimeSlot, creates Appointment (status: pending),
          transitions TimeSlot held → booked in the same transaction; if the TimeSlot was already
          held/booked by a concurrent request, this call fails with a conflict and the client is
          shown "slot no longer available"
  → GET  GATEWAY_URL/api/appointments/:id                  (confirmation screen)
```

**Admin appointment management flow:**
```
Admin UI
  → GET   GATEWAY_URL/api/appointments?date=              (dashboard list/day view)
  → PATCH GATEWAY_URL/api/appointments/:id/confirm         (pending → confirmed)
  → PATCH GATEWAY_URL/api/appointments/:id/cancel          (→ cancelled; releases TimeSlot to available)
```

**Admin service management flow:**
```
Admin UI
  → GET    GATEWAY_URL/api/services
  → POST   GATEWAY_URL/api/services            (create)
  → PATCH  GATEWAY_URL/api/services/:id         (edit)
  → PATCH  GATEWAY_URL/api/services/:id/deactivate  (soft-delete)
```

---

## Auth and Org Boundaries
- **Authentication:** scoped to one role only — `Admin`. `Customer` never authenticates; the booking flow is fully guest.
- **RBAC:** simple allow/deny — every route is either `public` (booking flow, service listing) or `admin-only` (service management, appointment management). No finer-grained permission tiers in v1.
- **Cross-service permission checking:** gateway-centralized. The gateway verifies the JWT once and attaches `x-user-id`/`x-user-role` trusted internal headers; `appointment-service` and `user-service` trust these headers without re-verifying the token. This requires both downstream services to be network-private (unreachable directly from the public internet) in deployment.
- **Validation:** minimal claims embedded in the JWT at issuance (`userId`, `role`); a permission change (e.g. revoking admin access) only takes effect on the admin's next login.
- **Customer identity:** no authenticated identity — a `Customer` is identified per-`Appointment` by name + phone number captured at booking time, never stored as a standing account.
- **Authorization scope:** `Admin` has full access to all `Service` and `Appointment` records (single clinic, no per-admin data partitioning in v1).
- **Concurrency:** `TimeSlot` claims are atomic (single DB transaction/`findOneAndUpdate` conditional on current status) — see `seat-concurrency-layer` skill. Exactly one of two simultaneous booking attempts on the same `TimeSlot` succeeds.
- **Deletion model:** soft delete throughout. `Service` uses an `isActive`/`deactivatedAt` flag; `Appointment` uses its `status` field (`cancelled` instead of removal). Nothing is hard-deleted from the database.

---

## API Reference
See `docs/api-contract/*.yaml` (generated per service as features are implemented) for the authoritative, current route list. Summary by service:

| Service | Example routes |
|---|---|
| `user-service` | `POST /api/auth/login` |
| `appointment-service` | `GET/POST /api/services`, `PATCH /api/services/:id`, `GET /api/timeslots`, `GET/POST /api/appointments`, `PATCH /api/appointments/:id/confirm`, `PATCH /api/appointments/:id/cancel` |
| `gateway` | proxies all of the above under a single base URL, plus JWT verification |

---

## External Dependencies
| Service | Purpose | Notes |
|---|---|---|
| MongoDB | Primary datastore | One logical database per backend service; frontend never connects directly. |
| Hosting (TBD) | Frontend + backend deploy target | Not yet decided — see Open questions. |

No email, SMS, or payment integrations in v1 (see product-definition.md's Out of Scope).

---

## Operational Concerns
- **Environment configuration:** every service base URL and secret is env-var driven (`GATEWAY_URL`, `APPOINTMENT_SERVICE_URL`, `USER_SERVICE_URL`, `JWT_SECRET`, `MONGO_URI` per service) — no hardcoded URLs in code. Shared values live in `backend/.env.shared`; per-service cosmetic values (e.g. each service's own `PORT`) live in that service's own `.env`.
- **Failure isolation:** if `user-service` is down, admin login/auth-dependent routes fail but the public booking flow (`appointment-service` via `gateway`) keeps working. If `appointment-service` is down, booking and admin appointment/service management fail, but login still works. If `gateway` is down, nothing works — it's the single entry point.
- **Deployments:** frontend and backend deploy independently. A breaking API change requires a version-compatible rollout — see `versioning-rules.md`.

**Open questions / TBD:**
- Final hosting provider(s) for frontend/backend/MongoDB.
- Exact `TimeSlot` granularity (30 vs. 60 minutes) — decided at clinic setup time, see product-definition.md's Assumptions.
- `held` TimeSlot expiry timeout duration (exact seconds/minutes) — to be decided during `seat-concurrency-layer` implementation.

---

## Change Log
- 2026-08-18: Initial architecture defined.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.
