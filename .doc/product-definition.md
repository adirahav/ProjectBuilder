# Product Definition

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
This product removes the manual work of running a small dog-grooming clinic's appointment book by phone and paper. Instead of the owner juggling calls and a notebook to track who's booked when, the clinic publishes its services (haircut, nail trim, spa, etc.) with duration and price, and customers browse open time slots and book themselves — no account required. The owner manages services, sees the full appointment calendar, and confirms or cancels bookings from one dashboard.

---

## Target Users

**Customers (primary)** — anonymous, unregistered dog owners who want to book a grooming appointment without calling the clinic or creating an account. Their core need: see what services are offered, see real open time slots, and lock one in with minimal friction (just their contact details).

**Admin / business owner (secondary)** — the single person running the clinic. Their core need: define and price the services they offer, see the full schedule at a glance, and approve or cancel bookings without a separate phone-based booking process running in parallel.

There is no third role — no staff accounts, no multi-location support in v1.

---

## Problem Statement
Today, booking a grooming appointment means calling the clinic during business hours, and the owner has to manually check a paper or mental calendar for openings, write down the customer's chosen time, and remember to avoid double-booking. This wastes the owner's time on calls instead of grooming, and customers have no visibility into which times are actually free — they have to call and ask. Because there's no atomic reservation step, two customers calling close together can end up believing they hold the same slot until someone catches the conflict. This product replaces the phone/paper process with a live time-slot calendar customers can book directly, and gives the owner a single dashboard to manage services and confirm/cancel appointments.

---

## Value Proposition
The core value is turning appointment booking into a self-service action: customers see truthfully open slots and claim one instantly, and the owner is freed from being the sole scheduling bottleneck.

**Key differentiators:**
- No account required for customers — book with just contact details, lowering friction versus apps that force signup.
- Slot-level concurrency safety — two customers cannot both win the same time slot, unlike an honor-system paper calendar.
- Owner controls services (name, duration, price) directly, without needing a developer to change the offering.
- Single dashboard for the owner to see the whole schedule and act on bookings (approve/cancel), replacing phone-tag.

---

## Product Scope

**In scope:**
- Public service list with duration and price (see `naming-rules`, `mongoose-models-layer`)
- Date/time-slot picker showing real, currently-open slots (see `seat-concurrency-layer` for the contested-slot handling)
- Customer detail form (name, phone, optionally email) and booking confirmation, no login
- Booking confirmation screen/summary after a successful reservation
- Admin authentication (single owner account) (see `jwt-middleware-layer`)
- Admin dashboard: create/edit/deactivate services
- Admin dashboard: view all appointments (calendar or list), approve/cancel
- Slot-conflict handling so two customers cannot both claim the same time slot

**Out of scope (v1):**
- Multiple staff members / multiple simultaneous groomers (deferred — v1 assumes one groomer, one calendar)
- Multi-location support (deferred — single clinic only)
- Online payment at booking time (deferred — payment happens in person)
- Automated SMS/email reminders beyond a booking confirmation (deferred — notification-service starts minimal, can expand later)
- Customer accounts / booking history / login (never planned for v1 — anonymous booking is a deliberate choice, not a gap)
- Recurring/repeat appointments (deferred — each booking is a one-off in v1)

---

## Success Metrics

**Business metrics:**
- Reduction in phone calls the owner has to personally handle for scheduling
- Growth in appointments booked online vs. reported manually by the owner

**Product metrics:**
- Booking completion rate (started slot selection → confirmed appointment)
- Rate of slot-conflict errors surfaced to customers (should trend toward zero, not just be handled gracefully)
- Time from page load to confirmed booking

*Baseline values to be defined after first real usage.*

---

## Constraints and Assumptions

**Constraints:**
- No customer login — every booking flow must work for an anonymous visitor
- Only one admin account exists in v1 — no role hierarchy beyond customer/admin
- A time slot must never be confirmed for two different appointments — this is a hard invariant, not best-effort (see `seat-concurrency-layer`)

**Assumptions to validate:**
- A single groomer/calendar is sufficient — revisit if the clinic adds staff
- Contact details (name + phone) are enough to hold a booking without payment or verification — revisit if no-shows become a problem
- Hebrew + English with RTL-first UI covers the clinic's actual customer base
- Native app (Capacitor) usage will be meaningful enough to justify maintaining it alongside web

---

## Prioritization Rules
- Reduce the owner's manual scheduling workload before adding new customer-facing features
- Protect the core booking flow's reliability (no double-booked slots) over new feature breadth
- Defer anything payment-related or multi-staff until the single-groomer flow is solid
- Avoid building admin tooling more complex than a one-person clinic needs

---

## Update Triggers
List the kinds of changes that should trigger someone to revisit this file — e.g. a new user
segment, a scope change, a metric revision, a new platform target. (This section's shape is
reusable as-is; just adapt the specific triggers to this product.)
