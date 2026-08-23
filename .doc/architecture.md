# System Architecture

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of `Hila Tours`.

---

## System Overview
Monorepo: one `frontend/` app and one `backend/` directory containing two independently-runnable services, no shared gateway.

```
hila-tours/
├── frontend/            (React web app + Capacitor Android wrapper)
└── backend/
    ├── tour-service/            (Tour, Bus, Seat, BusType)
    └── user-management-service/ (Admin, auth)
```

```
                 ┌───────────────────────┐
   Browser  ───▶ │                       │
                 │   frontend/ (React)   │
   Android  ───▶ │   + Capacitor wrapper │
   (native)      │                       │
                 └──────────┬────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
  tour-service (BASE_URL)        user-management-service (BASE_URL)
  Tour / Bus / Seat / BusType    Admin / auth
```

---

## Context
**Problem solved:** Coordinating who sits where on a tour bus without an admin doing it all by hand, while guaranteeing no two passengers can be confirmed into the same seat.

**Key architectural constraints:**
- Seat is a contested, concurrency-sensitive resource — every state transition must be atomic and server-arbitrated.
- Two independent backend services with no gateway — the frontend calls each service's base URL directly, so auth claims must be self-sufficient (no cross-service callback to verify a token).
- No separate Passenger entity — passenger identity is transient, living only on the `seat` record for the duration of that booking.
- Full RTL Hebrew UI and WCAG 2.1 AA accessibility are non-negotiable constraints on every screen, not a post-hoc pass.
- Native Android via Capacitor reuses the same web build; token storage differs (`@capacitor/preferences` instead of `localStorage`).

---

## Primary Components

### Frontend
| Concern | Choice |
|---|---|
| Framework | React (Vite) |
| Styling | Tailwind CSS v4, RTL-first |
| State management | Zustand |
| HTTP client | fetch-based service layer, one module per entity |
| Auth storage | `@capacitor/preferences` on native builds; web fallback per `native-navigation-layer`/`jwt-middleware-layer` conventions |
| Icons | Lucide React |

Two main functional areas:
- **Passenger flow (public, unauthenticated):** tour/bus browsing, interactive seat map, seat-request modal.
- **Admin console (authenticated):** login/signup, seat management tab, tour/bus/bus-type CRUD tab, passenger manifest tab.

**Android App:** Capacitor wraps the same web build for Android only (no iOS in v1). The only native-specific behavior is JWT storage via `@capacitor/preferences` instead of `localStorage`, and back-button/navigation-stack handling per `native-navigation-layer`.

### Backend
| Service | Base URL env var | Responsibility |
|---|---|---|
| `tour-service` | `TOUR_SERVICE_BASE_URL` | Tour, Bus, Seat, BusType — all domain/business logic including the seat concurrency-sensitive flows |
| `user-management-service` | `USER_SERVICE_BASE_URL` | Admin accounts, login, signup, JWT issuance |

Each service follows a controller/service/routes/middleware-per-domain internal layout, per `backend-service-layer`.

**Seat lifecycle (the contested resource):**
```
available ──(passenger request)──▶ pending ──(admin approve)──▶ taken
available ──(admin toggle-reserve)──▶ reserved ──(admin toggle-reserve)──▶ available
pending ──(admin cancel)──▶ available
taken ──(admin cancel)──▶ available
any state ──(admin manual-assign)──▶ taken
any two seats ──(admin swap-move)──▶ (positions/occupants exchanged or moved)
```

---

## File Structure
Mirrors the layout in `System Overview` above (`frontend/`, `backend/tour-service/`, `backend/user-management-service/`), each service internally organized per `backend-service-layer`'s controller/service/routes/middleware convention. Update this section once the real folder tree is scaffolded in Phase E.

---

## Data Flow

**Auth flow (admin login):**
```
Admin login form
  → POST USER_SERVICE_BASE_URL/api/auth/login        (verify credentials)
        → returns JWT { sub: adminId, roles: [...] }
Admin signup form
  → POST USER_SERVICE_BASE_URL/api/auth/signup        (create admin, roles: ["user"] always)
```
The JWT payload carries the minimal claims (`adminId`, `roles`) needed for `tour-service` to authorize requests without calling back to `user-management-service` — a role change (e.g. promotion to `admin`) only takes effect on the admin's next login.

**Passenger seat-request flow (the core, concurrency-sensitive flow):**
```
Passenger seat map UI
  → GET  TOUR_SERVICE_BASE_URL/api/buses/:busId/seats           (load live seat map)
  → POST TOUR_SERVICE_BASE_URL/api/seats/bookings               (request a seat: name, phone, pickupPoint)
        → available → pending, or 409 conflict + refreshed seat map if lost the race
```

**Admin seat-management flow:**
```
Admin dashboard — Seats tab
  → POST TOUR_SERVICE_BASE_URL/api/seats/approve                (pending → taken)
  → POST TOUR_SERVICE_BASE_URL/api/seats/cancel                 (pending|taken → available)
  → POST TOUR_SERVICE_BASE_URL/api/seats/toggle-reserve          (available ↔ reserved)
  → POST TOUR_SERVICE_BASE_URL/api/seats/manual-assign            (any → taken, admin-set passenger)
  → POST TOUR_SERVICE_BASE_URL/api/seats/swap-move                 (move or swap two seats' occupants)
```

**Admin tour/bus/bus-type management flow:**
```
Admin dashboard — Tours & Buses tab
  → POST/PATCH/DELETE TOUR_SERVICE_BASE_URL/api/tours              (CRUD, soft-delete)
  → POST/PATCH/DELETE TOUR_SERVICE_BASE_URL/api/buses               (CRUD, soft-delete)
  → POST/PATCH/DELETE TOUR_SERVICE_BASE_URL/api/busType              (CRUD, incl. duplicate/reset-to-default)
```

---

## Auth and Org Boundaries
- **Authentication:** Single role type (`admin` entity), issued by `user-management-service`. Passengers are never authenticated — they act anonymously against `tour-service`.
- **Authorization (RBAC):** `roles` array on the `admin` entity (`admin` | `user`). Every mutating admin route on `tour-service` requires `roles.includes("admin")`; signup alone never grants it.
- **Cross-service permission checking:** No gateway and no callback — `tour-service` verifies the JWT signature and reads `roles` directly from the token claims issued by `user-management-service`, sharing the same JWT secret/verification config.
- **Validation:** All admin-mutating routes validate both JWT validity and the `admin` role before touching seat/tour/bus state.
- **Passenger identity:** No account, no token — passenger name/phone/pickupPoint are submitted per-request and stored only on the `seat` record they claimed.
- **Authorization scope:** Flat — no per-tour admin ownership in v1; any authenticated admin can manage any tour (see Open Questions).
- **Concurrency:** Seat status transitions (`available → pending`, etc.) are atomic conditional updates (e.g. `findOneAndUpdate` with a status guard) at the database layer — a losing concurrent request receives a conflict response and a refreshed seat map, never a silent overwrite. Full detail in `seat-concurrency-layer`.
- **Deletion model:** Soft delete only for `tour` and `bus` (`deletedAt` field); no hard deletes in v1.

---

## API Reference
Populated from `docs/api-contract/*.yaml` once the Frontend Agent generates them per real ticket (see Phase E notes in the setup process) — this section is a living index, not the source of truth. Placeholder until those contract files exist:

| Service | Method | Route | Purpose |
|---|---|---|---|
| user-management-service | POST | `/api/auth/login` | Admin login, returns JWT |
| user-management-service | POST | `/api/auth/signup` | Admin signup, `roles: ["user"]` |
| tour-service | GET/POST/PATCH/DELETE | `/api/tours` | Tour CRUD (soft-delete) |
| tour-service | GET/POST/PATCH/DELETE | `/api/buses` | Bus CRUD (soft-delete) |
| tour-service | GET/POST/PATCH/DELETE | `/api/busType` | Bus-type template CRUD |
| tour-service | GET | `/api/buses/:busId/seats` | Live seat map |
| tour-service | POST | `/api/seats/bookings` | Passenger seat request |
| tour-service | POST | `/api/seats/approve` | Admin approve seat |
| tour-service | POST | `/api/seats/cancel` | Admin cancel/release seat |
| tour-service | POST | `/api/seats/toggle-reserve` | Admin manual reserve/unreserve |
| tour-service | POST | `/api/seats/manual-assign` | Admin manual passenger assignment |
| tour-service | POST | `/api/seats/swap-move` | Admin move/swap seats |

---

## External Dependencies
| Service | Purpose | Notes |
|---|---|---|
| MongoDB | Primary database for both backend services | Local default `mongodb://localhost:27017/hila-tours` for development; only backend services connect, frontend never connects directly |
| Hosting (TBD) | Frontend + backend deployment | Provider not yet decided — see Open Questions |

No payment, SMS, or email providers in v1 (out of scope per `product-definition.md`).

---

## Operational Concerns
- **Environment configuration:** Each service reads its own `.env` (base URLs, `MONGODB_URI`, JWT secret/expiry) — no hardcoded URLs; shared values live in `backend/.env.shared` per `development/dev-loop.js`'s `ensureBackendEnv`.
- **Failure isolation:** If `user-management-service` is down, existing sessions (valid JWTs) keep working against `tour-service`; new logins/signups fail. If `tour-service` is down, admin auth still works but no tour/bus/seat functionality is available — passengers see no live data.
- **Deployments:** Frontend and both backend services deploy independently; a breaking change to either service's API contract requires a coordinated frontend release, since there is no gateway to version behind.

**Open questions / TBD:**
- Hosting provider(s) for frontend and backend services — not yet decided.
- Per-tour admin ownership vs. shared admin pool (see `product-definition.md` Constraints and Assumptions) — deferred.

---

## Change Log
- 2026-08-23: Initial architecture defined.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.
