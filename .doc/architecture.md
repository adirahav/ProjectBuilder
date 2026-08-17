# System Architecture

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of `BookMe`.

---

## System Overview
Monorepo, two backend services behind no production gateway (frontend calls each service's base URL directly), plus a single React frontend.

```
BookMe/
├── frontend/                  (React + Vite, single app — public booking flow + admin dashboard)
└── backend/
    ├── booking-service/       (owns Service, TimeSlot, Appointment — public + internal admin API)
    └── admin-service/         (admin auth/JWT issuance, dashboard aggregation, calls booking-service)
```

```
Browser (Customer)  ──▶  booking-service  (public API: browse Services/TimeSlots, create Appointment)

Browser (Admin)     ──▶  admin-service    (login → JWT)
                    ──▶  booking-service  (admin-scoped API: approve/cancel/reschedule, manage Services)
                              [JWT issued by admin-service, validated by booking-service]
```

---

## Context
**Problem solved:** Replace manual phone/WhatsApp appointment scheduling for a small clinic/salon with self-service customer booking and a single admin dashboard.

**Key architectural constraints:**
- `TimeSlot` is a contested resource — two customers may race to book the same slot; correctness under concurrency is non-negotiable (`seat-concurrency-layer`).
- Two backend services must share a consistent view of `Service`/`TimeSlot`/`Appointment` without dual-write conflicts — resolved by giving `booking-service` sole ownership of that data (see Primary Components).
- No production gateway — the frontend talks to each service's base URL directly, so CORS and per-service base-URL env vars matter.
- Customers are never authenticated — every customer-facing endpoint must work for an anonymous actor identified only by the contact details submitted at booking time.

---

## Primary Components

### Frontend
| Concern | Choice |
|---|---|
| Framework | React + Vite |
| Styling | Tailwind CSS v4 |
| State management | Zustand |
| HTTP client | fetch-based service layer (`service-layer` skill) |
| Auth storage | JWT stored client-side for the Admin session only; no storage for Customers |

**Functional areas:**
- **Public booking flow** — browse `Services`, browse available `TimeSlots` for a chosen `Service`/date, submit contact details to create an `Appointment`. No login.
- **Admin dashboard** — login, manage the `Service` catalog, view all `Appointments`, approve/cancel/reschedule.

### Backend
| Service | Base URL env var | Responsibility |
|---|---|---|
| `booking-service` | `VITE_BOOKING_SERVICE_URL` (frontend) / `BOOKING_SERVICE_PORT` (default `4001`) | Owns `Service`, `TimeSlot`, `Appointment` models and all writes to them. Exposes the public customer API (browse + book) and an admin-scoped API (approve/cancel/reschedule/manage Services) that trusts JWTs issued by `admin-service`. Owns `TimeSlot` concurrency logic (`seat-concurrency-layer`). |
| `admin-service` | `VITE_ADMIN_SERVICE_URL` (frontend) / `ADMIN_SERVICE_PORT` (default `4002`) | Owns the `Admin` account, issues JWTs on login, serves dashboard-aggregation views by calling `booking-service`'s admin-scoped API. Holds no `Service`/`TimeSlot`/`Appointment` data itself. |

Both services follow the same internal layout convention: `controller/ service/ routes/ middleware/` per domain.

**`TimeSlot` lifecycle:**
```
available ──(customer starts booking)──▶ held ──(appointment confirmed within hold window)──▶ booked
   ▲                                        │
   └──────────(hold expires / booking abandoned)──┘

booked ──(admin cancels or reschedules the Appointment)──▶ available
```

---

## File Structure
_Mirror the real folder tree here once `backend-service-layer` and `page-layer` skill templates are filled and the actual repo structure exists — kept in sync going forward, not a fresh design decision._

---

## Data Flow

**Customer booking flow:**
```
Customer UI
  → GET  booking-service/api/services                  (browse Service catalog)
  → GET  booking-service/api/services/:id/timeslots     (browse available TimeSlots for a date)
  → POST booking-service/api/appointments                (hold TimeSlot, create Appointment)
        → TimeSlot: available → held → booked; Appointment created in `pending`
```

**Admin auth flow:**
```
Admin UI
  → POST admin-service/api/auth/login                    (username/password)
        → admin-service issues JWT { sub: adminId, role: "admin" }
```
The JWT payload carries only the minimal `role: "admin"` claim; `booking-service` validates the token's signature and role claim on every admin-scoped route without calling back to `admin-service`. A permission change only takes effect on the admin's next login.

**Admin appointment management flow:**
```
Admin UI (JWT attached)
  → GET   booking-service/api/admin/appointments          (list all Appointments)
  → PATCH booking-service/api/admin/appointments/:id/approve    (pending → confirmed)
  → PATCH booking-service/api/admin/appointments/:id/cancel     (any → cancelled; TimeSlot → available)
  → PATCH booking-service/api/admin/appointments/:id/reschedule (releases old TimeSlot, holds new one)
```

---

## Auth and Org Boundaries
- **Authentication:** Scoped to the `Admin` role only. Customers are never authenticated.
- **Authorization (RBAC):** Single role (`admin`) beyond anonymous — no permission matrix needed for v1.
- **Cross-service permission checking:** `admin-service` issues the JWT at login; `booking-service` validates it locally (signature + `role` claim) without a callback, per the standard `jwt-middleware-layer` pattern.
- **Validation:** All customer-submitted input (contact details, selected `TimeSlot`) is validated server-side in `booking-service` before any write.
- **Customer identity:** No account — identified per-`Appointment` by name + phone/email captured at booking time. Not persisted as a reusable identity across bookings in v1.
- **Authorization scope:** Public routes require no token; admin routes require a valid `admin`-role JWT.
- **Concurrency:** `TimeSlot` claiming uses an atomic update (conditional write guarded on current status) inside `booking-service`, per `seat-concurrency-layer` — no dual-write path exists since only `booking-service` touches this data.
- **Deletion model:** Soft delete (`deletedAt` field) across all entities, per `.rule/database-rules.md`.

---

## API Reference
_Living index into `docs/api-contract/api-contract.booking-service.yaml` and `docs/api-contract/api-contract.admin-service.yaml`, generated by the Frontend Agent as real feature tickets are implemented. Not the source of truth itself._

---

## External Dependencies
| Service | Purpose | Notes |
|---|---|---|
| MongoDB | Primary datastore, owned exclusively by `booking-service` for domain data and by `admin-service` for the `Admin` account | Frontend never connects directly |
| Email provider (TBD) | Booking confirmation + appointment reminder emails | Provider not yet chosen (e.g. SendGrid/Nodemailer candidate) — see Open questions |
| Hosting (TBD) | Frontend + backend deployment | Provider not yet chosen — see Open questions |

SMS notifications are out of scope for v1 (`.doc/product-definition.md` Scope) — email is the only notification channel for now.

---

## Operational Concerns
**Environment configuration:** Each service reads its port and MongoDB connection string from environment variables; the frontend reads each service's base URL from `VITE_BOOKING_SERVICE_URL` / `VITE_ADMIN_SERVICE_URL`. No hardcoded URLs.

**Failure isolation:** If `admin-service` is down, the public customer booking flow is unaffected (it never calls `admin-service`). If `booking-service` is down, both the customer flow and the admin dashboard's data views break, since `admin-service` holds no domain data of its own.

**Deployments:** Frontend and both backend services deploy independently. A breaking change to `booking-service`'s admin-scoped API requires a coordinated `admin-service`/frontend update, since both depend on its contract.

**Open questions / TBD:**
- Hosting provider for frontend and backend services
- Email provider for confirmation/reminder sending
- Slot hold duration (how long a `TimeSlot` stays `held` before reverting to `available` if booking isn't completed)

---

## Change Log
- 2026-08-16: Initial architecture defined.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.
