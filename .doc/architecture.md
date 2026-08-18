# System Architecture

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of the Dog Grooming Appointment Booking System.

---

## System Overview
Monorepo. One frontend (React web app, also wrapped for native via Capacitor) and four backend services behind a single API gateway:

```
project-root/
├── frontend/                  # React + Vite + Tailwind v4 + Zustand
│   └── (wrapped for Android/iOS via Capacitor)
├── backend/
│   ├── api-gateway/           # single public entry point, JWT verification
│   ├── booking-service/       # Services, Appointments, TimeSlots
│   ├── user-service/          # Admin auth
│   └── notification-service/  # booking confirmations / reminders
```

```
Browser (Customer/Admin) ──┐
Native app (Capacitor) ────┼──▶ api-gateway (verifies JWT, attaches internal header)
                            │        ├──▶ booking-service
                            │        ├──▶ user-service
                            │        └──▶ notification-service (server-to-server only)
```

---

## Context
**Problem solved:** Replace phone/paper appointment booking for a single-groomer dog-grooming clinic with a self-service, slot-conflict-safe online booking flow.

**Key architectural constraints:**
- No customer login — the booking flow must work fully anonymously.
- `TimeSlot` is a contested resource — two customers can race for the same slot; the system must guarantee at most one wins (see `seat-concurrency-layer`).
- Single admin account, no role hierarchy beyond Customer/Admin.
- Microservice split with a gateway that centralizes JWT verification — downstream services trust an internal header instead of re-verifying tokens.
- Must support Hebrew (RTL, default) and English (LTR), and both web and native (Capacitor) targets.

---

## Primary Components

### Frontend
| Concern | Choice |
|---|---|
| Framework | React + Vite |
| Styling | Tailwind CSS v4, logical properties for RTL/LTR |
| State management | Zustand |
| HTTP client | fetch-based service layer (see `service-layer`) |
| Auth storage | JWT stored client-side for the Admin session only (Customers never authenticate) |
| Icons | lucide-react |
| i18n | Hebrew (default, RTL) + English (LTR) |

Two main functional areas:
- **Public booking flow** (Customer-facing, unauthenticated): browse Services, pick a date/TimeSlot, submit contact details, confirm booking.
- **Admin console** (authenticated): manage Services, view/manage Appointments (approve/cancel) via a calendar or list view.

**Android/iOS App:** Capacitor wraps the same web build. No functional difference in booking logic; native adds back-button/navigation-stack handling (see `native-navigation-layer`) and native storage for the Admin JWT. No feature is native-only in v1.

### Backend
| Service | Base-URL env var | Responsibility |
|---|---|---|
| `api-gateway` | `GATEWAY_BASE_URL` | Public entry point; verifies the Admin JWT; attaches an internal trust header (`x-internal-admin`) to downstream requests; proxies to the three services below. |
| `booking-service` | `BOOKING_SERVICE_URL` | Owns `Service`, `Appointment`, `TimeSlot` — the core booking domain, including the contested-slot concurrency logic. |
| `user-service` | `USER_SERVICE_URL` | Owns Admin authentication (login, JWT issuance). |
| `notification-service` | `NOTIFICATION_SERVICE_URL` | Sends booking confirmations and reminders; called server-to-server by `booking-service`, never directly by the frontend. |

Each backend service follows a controller/service/routes/middleware-per-domain internal layout (see `backend-service-layer`).

**`TimeSlot` lifecycle (contested entity):**
```
open ──(customer starts booking)──▶ held ──(booking confirmed)──▶ booked
  ▲                                    │
  └──────────(hold expires/cancelled)──┘
booked ──(appointment cancelled)──▶ open
```
- `open` → `held`: a customer begins the booking form; short-lived, atomic claim (see `seat-concurrency-layer`) so a second customer cannot also hold the same slot.
- `held` → `booked`: the customer submits contact details and the `Appointment` is created/confirmed.
- `held` → `open`: the hold expires (customer abandons the form) or is explicitly released.
- `booked` → `open`: the Admin or customer cancels the `Appointment`.

---

## File Structure
Mirrors the folder tree in System Overview above. Update this section once the frontend/backend skeletons exist and the structure stabilizes (Phase E scaffolding tasks).

---

## Data Flow

**Customer booking flow:**
```
Customer UI
  → GET  BOOKING_SERVICE_URL/api/services              (list active Services)
  → GET  BOOKING_SERVICE_URL/api/time-slots?serviceId=  (list open TimeSlots for a Service)
  → POST BOOKING_SERVICE_URL/api/time-slots/:id/hold    (atomically claim the slot → held)
  → POST BOOKING_SERVICE_URL/api/appointments           (create Appointment with contact details → slot becomes booked)
        → notification-service is called server-to-server to send a booking confirmation
```

**Admin auth flow:**
```
Admin UI
  → POST GATEWAY_BASE_URL/api/auth/login  (credentials → user-service issues JWT)
        → JWT payload: { sub: adminId, role: "admin" }
  → subsequent requests carry `Authorization: Bearer <token>`; api-gateway verifies it once
        and forwards to booking-service/user-service with `x-internal-admin: true` instead of
        the raw token
```

**Admin manage-appointments flow:**
```
Admin UI
  → GET   GATEWAY_BASE_URL/api/appointments                 (list all, gateway-authenticated)
  → PATCH GATEWAY_BASE_URL/api/appointments/:id/confirm      (pending → confirmed)
  → PATCH GATEWAY_BASE_URL/api/appointments/:id/cancel       (→ cancelled, releases TimeSlot to open)
```

---

## Auth and Org Boundaries
- **Authentication** is scoped to the Admin role only — Customers never authenticate.
- **RBAC:** simple allow/deny — two roles, `admin` (authenticated) and the implicit anonymous `customer` (unauthenticated, only allowed on public booking endpoints).
- **Cross-service permission checking:** gateway-centralized. Only `api-gateway` verifies the JWT; it then attaches an internal header (`x-internal-admin: true`) that downstream services trust implicitly. Downstream services must not be reachable directly from the public internet in production — only via the gateway.
- **Validation:** each service validates its own request bodies independently of auth (e.g. required fields on `Service`/`Appointment`).
- **Anonymous Customer identity:** no identity beyond the contact details (name, phone, optional email) submitted at booking time; not tied to any account.
- **Authorization scope:** a valid Admin JWT grants access to all Admin endpoints — no per-resource ownership model, since there is only one Admin.
- **Concurrency:** `TimeSlot` claims use an atomic conditional update (`open` → `held` only if still `open`) to guarantee at most one customer wins a race for the same slot — see `seat-concurrency-layer`.
- **Deletion model:** soft delete throughout (`isActive`/`deletedAt`-style flags) — see `database-rules`. Appointments are cancelled, never hard-deleted.

---

## API Reference
Once `docs/api-contract/*.yaml` files exist (generated by the Frontend Agent as features are built), this section will summarize each service's routes as a method/route/purpose table. Treated as a living index into those contract files, not the source of truth.

---

## External Dependencies
| Service | Purpose | Notes |
|---|---|---|
| MongoDB | Primary datastore, one logical database per service (or shared cluster, separate collections) | Connection string lives in `backend/.env.shared` per service; frontend never connects directly. |
| Email/SMS provider (TBD) | Booking confirmations/reminders sent by `notification-service` | Provider not yet chosen — start with a simple transactional email provider; SMS deferred until needed. |

---

## Operational Concerns
- **Environment configuration:** every service base URL and secret comes from env vars (`backend/.env.shared` for shared values, each service's own `.env.example` for per-service values like `PORT`); no hardcoded URLs.
- **Failure isolation:** if `notification-service` is down, booking still succeeds (confirmation send is best-effort/queued, not blocking); if `user-service` is down, Admin login fails but the public booking flow is unaffected; if `booking-service` is down, nothing works (it owns the core domain).
- **Deployments:** frontend and backend deploy independently. A breaking API change requires updating the relevant `docs/api-contract/*.yaml` and coordinating frontend/backend agent work in the same ticket.

**Open questions / TBD:**
- Hosting provider(s) for frontend/backend not yet chosen.
- Email/SMS provider for `notification-service` not yet chosen.
- Whether MongoDB is one shared cluster with per-service databases, or fully separate clusters — deferred to deployment setup.

---

## Change Log
- 2026-08-18: Initial architecture defined.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.
