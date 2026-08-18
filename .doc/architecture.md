# System Architecture

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of `ClinicBook`.

---

## System Overview
Monorepo. One frontend app and four backend microservices, each an independent Node/Express service with its own MongoDB database.

```
ClinicBook/
├── frontend/                  (React + Vite, web + Capacitor native)
└── backend/
    ├── api-gateway/           (single public entry point)
    ├── appointment-service/   (Appointment + TimeSlot)
    ├── catalog-service/       (Service)
    └── user-management-service/ (Admin auth)
```

```
Browser / Native App (Capacitor)
        │
        ▼
   api-gateway  (only service reachable from outside in production)
        │
   ┌────┼────────────┬─────────────────────┐
   ▼    ▼             ▼                     ▼
appointment-service  catalog-service   user-management-service
(private network)    (private network)  (private network)
```

---

## Context
**Problem solved:** ClinicBook replaces manual phone/paper scheduling for a small clinic or salon with a self-service booking flow for guest customers and a management dashboard for the admin.

**Key architectural constraints:**
- Guest customers must never require an account — no customer-facing auth at all
- TimeSlot is a contested resource — exactly one Appointment may ever hold a given TimeSlot, even under concurrent requests
- Single Admin role — no multi-tier RBAC needed
- Gateway-centralized JWT — only `api-gateway` verifies tokens; downstream services trust internal headers and must not be internet-reachable in production
- Must run as both a web app and a native Capacitor app from one frontend codebase
- Bilingual RTL(Hebrew)/LTR(English) UI from day one, not bolted on later

---

## Primary Components

### Frontend
| Layer | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS v4 (utility-first, logical properties for RTL/LTR) |
| State management | Zustand |
| HTTP client | Axios |
| Icons | lucide-react |
| Auth storage | JWT stored client-side (Admin only), attached as Bearer token |
| Native shell | Capacitor (Android/iOS) |

Two main functional areas:
- **Customer booking flow** (public, unauthenticated): browse Services → pick a TimeSlot → enter details → confirm.
- **Admin dashboard** (authenticated): login, manage Services, view/approve/cancel Appointments.

**Android/iOS App:** Capacitor wraps the same web build. Native adds hardware back-button handling (see `native-navigation-layer` skill) and native-safe storage for the Admin's JWT. No push notifications or native-only features are in scope for v1 — the native app is a thin wrapper around the same UI and API calls as the web app.

### Backend
| Service | Base URL env var | Responsibility |
|---|---|---|
| `api-gateway` | `VITE_API_GATEWAY_URL` | Single public entry point; verifies JWT; proxies to internal services with `x-user-id`/`x-user-role` headers |
| `appointment-service` | `APPOINTMENT_SERVICE_URL` (internal) | Owns `Appointment` and `TimeSlot`; enforces slot-concurrency guarantee |
| `catalog-service` | `CATALOG_SERVICE_URL` (internal) | Owns `Service` (name, duration, price) |
| `user-management-service` | `USER_SERVICE_URL` (internal) | Admin login/auth only — issues JWT, no customer accounts |

**TimeSlot lifecycle:**
```
available ──(customer books)──▶ pending ──(admin approves)──▶ booked
   ▲                               │                             │
   │                        (admin/customer cancels)      (appointment time passes)
   └───────────────────────────────┴─────────────────────────────┘
                                                                   ▼
                                                              completed (Appointment)
available ──(admin blocks)──▶ blocked ──(admin unblocks)──▶ available
```
`TimeSlot.status` transitions are atomic (single conditional update, e.g. `findOneAndUpdate` with a status guard) so two simultaneous booking requests for the same slot cannot both succeed — see `seat-concurrency-layer` skill (adapted to TimeSlot).

Each backend service follows the same internal layout convention: `routes/ → controller/ → service/ → model/`, with `middleware/` for auth/validation.

---

## File Structure
Mirrors the System Overview tree above. `frontend/` follows the layered structure defined by the `*-layer` skills (`page-layer`, `service-layer`, `state-management-layer`, `ui-component-layer`); each `backend/<service>/` follows `backend-service-layer` and `mongoose-models-layer`. Update this section if the real repo layout diverges.

---

## Data Flow

**Admin auth:**
```
Admin Login UI
  → POST api-gateway/api/auth/login          (credentials → JWT)
        → gateway issues JWT {sub, role: "admin"}, sets internal x-user-id/x-user-role on subsequent proxied calls
```

**Customer booking flow (core flow, touches the contested resource):**
```
Customer UI
  → GET  api-gateway/api/services                        (list active Services)
  → GET  api-gateway/api/timeslots?serviceId=:id&date=:d  (list available TimeSlots for a Service/date)
  → POST api-gateway/api/appointments                     (book: serviceId, timeSlotId, customer details)
        → appointment-service atomically flips TimeSlot available → pending, creates Appointment(status: pending)
        → on conflict (slot already taken), 409 returned to customer, UI re-fetches available slots
```

**Admin management flow:**
```
Admin Dashboard UI
  → GET   api-gateway/api/appointments?status=pending      (list appointments to review)
  → PATCH api-gateway/api/appointments/:id/approve         (pending → approved; TimeSlot pending → booked)
  → PATCH api-gateway/api/appointments/:id/cancel          (any non-terminal status → cancelled; TimeSlot → available)
  → POST/PATCH/DELETE api-gateway/api/services              (manage Service catalog)
```

---

## Auth and Org Boundaries
- **Authentication:** Single authenticated role (Admin). Customers are always guests — no customer authentication exists.
- **RBAC:** Simple allow/deny — routes are either public (customer-facing) or Admin-only (dashboard/management). No permission tiers within Admin.
- **Cross-service permission checking:** Gateway-centralized. `api-gateway` is the only service that verifies the JWT signature/expiry. Once verified, it attaches `x-user-id` and `x-user-role` internal headers to the proxied request; downstream services trust these headers and do not re-verify the JWT. Downstream services must not be reachable directly from the public internet in production — this trust model only holds if the internal network boundary is enforced at the infra level.
- **Validation:** Each service validates its own request bodies (e.g. `appointment-service` validates TimeSlot ownership/state before booking); the gateway does not validate business payloads, only the token.
- **Customer identity:** No identity beyond what's submitted in the booking form (name, phone, email) — stored on the `Appointment` record itself, not a separate user account.
- **Authorization scope:** Admin-only routes reject any request without a valid `x-user-role: admin` header; customer-facing routes require no auth headers at all.
- **Concurrency:** TimeSlot booking uses an atomic conditional update (`findOneAndUpdate` guarded on current status) inside `appointment-service` so only one of two simultaneous booking requests for the same TimeSlot can succeed — see `seat-concurrency-layer` skill.
- **Deletion model:** Soft delete for `Service` (`isActive` flag — historical Appointments must still reference a Service that existed at booking time) and for `Appointment`/`TimeSlot` (status-based, never hard-deleted, so history is preserved for the admin dashboard).

---

## API Reference
Living index — see `docs/api-contract/api-contract.<service-name>.yaml` for the authoritative, generated-as-built contract per service (regenerated by the Frontend Agent as features land). This section is not pre-populated at setup time.

---

## External Dependencies
| Service | Purpose | Notes |
|---|---|---|
| MongoDB | Primary datastore, one database per backend service | Frontend never connects directly; all access goes through each service's own API |
| Hosting (TBD) | Frontend + backend deployment target | Provider not yet chosen |

---

## Operational Concerns
**Environment configuration:** Every service reads its config from environment variables (`.env` per service, `backend/.env.shared.example` for values shared across all services) — no hardcoded URLs or secrets in code.

**Failure isolation:** If `catalog-service` is down, customers can't browse Services but existing Appointments/TimeSlots are unaffected. If `appointment-service` is down, browsing Services still works but booking/dashboard actions fail. If `user-management-service` is down, Admin cannot log in, but already-issued JWTs remain valid until expiry (verified by the gateway independent of the issuing service being reachable).

**Deployments:** Frontend and backend deploy independently. A breaking API change requires a version-compatible rollout: the api-gateway's contract with the frontend must stay backward-compatible, or frontend and gateway must deploy together.

**Open questions / TBD:**
- Hosting provider(s) for frontend/backend not yet chosen
- Whether TimeSlot generation is fully manual (admin creates each slot) or template-driven (admin sets recurring availability, slots auto-generate) — to be decided during backend implementation

---

## Change Log
- 2026-08-17: Initial architecture defined.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.
